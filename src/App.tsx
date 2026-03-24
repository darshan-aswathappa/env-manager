import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  saveProjectEnv,
  loadProjectEnv,
  importAllEnvsFromProject,
  registerProject,
  unregisterProject,
  checkGitignoreStatus,
} from "./lib/envFile";
import { buildProjectTree } from "./lib/projectTree";
import type { Project, EnvVar, ProjectTreeNode, GitignoreStatus, AppSettings, Environment } from "./types";
import { ENV_SUFFIXES } from "./types";
import Sidebar from "./components/Sidebar";
import VarList from "./components/VarList";
import VarDetail from "./components/VarDetail";
import ShellIntegration from "./components/ShellIntegration";
import SettingsPanel from "./components/Settings";
import Onboarding from "./components/Onboarding";
import { FolderOpen, Plus, X } from "lucide-react";

const STORAGE_KEY = "dotenv_mgr_projects";
const ONBOARDING_KEY = "dotenv_mgr_onboarding";
const SETTINGS_KEY = "dotenv_mgr_settings";

const DEFAULT_SETTINGS: AppSettings = {
  defaultShell: "zsh",
  defaultInheritanceMode: "merge-child-wins",
  autoMaskMinutes: 0,
  clipboardClearSeconds: 0,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function isOnboardingComplete(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "complete";
}
type SaveStatus = "idle" | "saving" | "saved" | "error";

function ensureAllEnvironments(envs: Environment[] | undefined, fallbackVars: EnvVar[]): Environment[] {
  const existing = envs ?? [];
  return ENV_SUFFIXES.map((suffix) => {
    const found = existing.find((e) => e.suffix === suffix);
    if (found) return found;
    // For base env, use fallback vars from legacy format
    return { suffix, vars: suffix === '' ? fallbackVars : [] };
  });
}

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    // Migrate legacy projects missing new fields
    return parsed.map((p) => ({
      ...p,
      parentId: p.parentId ?? null,
      inheritanceMode: p.inheritanceMode ?? ("merge-child-wins" as const),
      sortOrder: p.sortOrder ?? 0,
      vars: (p.vars || []).map((v) => ({
        ...v,
        sourceProjectId: v.sourceProjectId ?? p.id,
        val: "", // val is never stored in localStorage
        revealed: false,
      })),
      environments: ensureAllEnvironments(p.environments, p.vars || []),
      activeEnv: p.activeEnv ?? '',
    }));
  } catch {
    return [];
  }
}

function persistProjects(projects: Project[]): void {
  // Strip secret values and ephemeral reveal state before writing to storage
  const sanitized = projects.map((p) => ({
    ...p,
    vars: p.vars.map((v) => ({ ...v, val: "", revealed: false })),
    environments: p.environments.map((env) => ({
      ...env,
      vars: env.vars.map((v) => ({ ...v, val: "", revealed: false })),
    })),
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export default function App() {
  const [onboardingComplete, setOnboardingComplete] = useState(isOnboardingComplete);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => loadProjects()[0]?.id ?? null
  );
  const [selectedVarId, setSelectedVarId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [gitignoreStatus, setGitignoreStatus] = useState<GitignoreStatus>('no_gitignore');
  const [showShellIntegration, setShowShellIntegration] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);
  const dialogRef = useRef<HTMLDivElement>(null);
  const autoMaskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Sync to localStorage */
  useEffect(() => {
    persistProjects(projects);
  }, [projects]);

  /* Persist settings */
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  }, [appSettings]);

  /* Auto-mask revealed values after inactivity */
  useEffect(() => {
    if (!appSettings.autoMaskMinutes) return;
    const delay = appSettings.autoMaskMinutes * 60 * 1000;

    function resetTimer() {
      if (autoMaskTimerRef.current) clearTimeout(autoMaskTimerRef.current);
      autoMaskTimerRef.current = setTimeout(() => {
        setProjects((prev) =>
          prev.map((p) => ({
            ...p,
            vars: p.vars.map((v) => ({ ...v, revealed: false })),
            environments: p.environments.map((env) => ({
              ...env,
              vars: env.vars.map((v) => ({ ...v, revealed: false })),
            })),
          }))
        );
      }, delay);
    }

    document.addEventListener("mousemove", resetTimer);
    document.addEventListener("keydown", resetTimer);
    resetTimer();

    return () => {
      document.removeEventListener("mousemove", resetTimer);
      document.removeEventListener("keydown", resetTimer);
      if (autoMaskTimerRef.current) clearTimeout(autoMaskTimerRef.current);
    };
  }, [appSettings.autoMaskMinutes]);

  /* Load vars per project from app data on mount and when project list changes */
  useEffect(() => {
    let cancelled = false;
    async function loadAllVars() {
      for (const project of projects) {
        if (cancelled) break;
        try {
          const updatedEnvs: Environment[] = [];
          for (const env of project.environments) {
            const vars = await loadProjectEnv(project.id, env.suffix);
            updatedEnvs.push({ suffix: env.suffix, vars: vars.length > 0 ? vars : env.vars });
          }
          if (cancelled) break;
          const activeVars = updatedEnvs.find(e => e.suffix === project.activeEnv)?.vars ?? [];
          setProjects((prev) =>
            prev.map((p) => (p.id === project.id ? { ...p, environments: updatedEnvs, vars: activeVars } : p))
          );
        } catch {
          // Silently ignore — project has no saved env yet
        }
      }
    }
    loadAllVars();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Clear var selection and refresh gitignore status when project changes */
  useEffect(() => {
    setSelectedVarId(null);
    setSearchQuery("");
    setSaveStatus("idle");
    const project = projects.find((p) => p.id === selectedId);
    if (!project) {
      setGitignoreStatus('no_gitignore');
      return;
    }
    checkGitignoreStatus(project.path)
      .then(setGitignoreStatus)
      .catch(() => setGitignoreStatus('no_gitignore'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  /* ── Project actions ─────────────────────────────────── */
  const addProject = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select project folder",
      });
      if (!selected) return;
      const dirPath = selected as string;
      const segments = dirPath.replace(/\\/g, "/").split("/");
      const name = segments[segments.length - 1] || "Project";
      // Import all env files from the project directory
      const imported = await importAllEnvsFromProject(dirPath).catch(() => []);
      const environments: Environment[] = ENV_SUFFIXES.map((suffix) => {
        const found = imported.find((e) => e.suffix === suffix);
        return { suffix, vars: found?.vars ?? [] };
      });
      const activeVars = environments[0]?.vars ?? [];
      const newProject: Project = {
        id: crypto.randomUUID(),
        name,
        path: dirPath,
        parentId: null,
        vars: activeVars,
        environments,
        activeEnv: '',
        inheritanceMode: appSettings.defaultInheritanceMode,
        sortOrder: 0,
      };
      // Register in Tauri app data registry
      await registerProject({
        id: newProject.id,
        name: newProject.name,
        path: dirPath,
        parentId: null,
        activeEnv: '',
      }).catch(() => {});
      // Save each environment to app data
      for (const env of environments) {
        if (env.vars.length > 0) {
          await saveProjectEnv(newProject.id, env.suffix, env.vars).catch(() => {});
        }
      }
      setProjects((prev) => [...prev, newProject]);
      setSelectedId(newProject.id);
    } catch (err) {
      console.error("Failed to add project:", err);
    }
  }, []);

  const addSubProject = useCallback(
    async (parentId: string) => {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: "Select sub-project folder",
        });
        if (!selected) return;
        const dirPath = selected as string;
        const segments = dirPath.replace(/\\/g, "/").split("/");
        const name = segments[segments.length - 1] || "Project";
        const parent = projects.find((p) => p.id === parentId);
        // Import all env files from the sub-project directory
        const imported = await importAllEnvsFromProject(dirPath).catch(() => []);
        const environments: Environment[] = ENV_SUFFIXES.map((suffix) => {
          const found = imported.find((e) => e.suffix === suffix);
          return { suffix, vars: found?.vars ?? [] };
        });
        const activeVars = environments[0]?.vars ?? [];
        const newProject: Project = {
          id: crypto.randomUUID(),
          name,
          path: dirPath,
          parentId,
          vars: activeVars,
          environments,
          activeEnv: '',
          inheritanceMode: appSettings.defaultInheritanceMode,
          sortOrder: (parent?.vars?.length ?? 0),
        };
        await registerProject({
          id: newProject.id,
          name: newProject.name,
          path: dirPath,
          parentId,
          activeEnv: '',
        }).catch(() => {});
        // Save each environment to app data
        for (const env of environments) {
          if (env.vars.length > 0) {
            await saveProjectEnv(newProject.id, env.suffix, env.vars).catch(() => {});
          }
        }
        setProjects((prev) => [...prev, newProject]);
        setSelectedId(newProject.id);
      } catch (err) {
        console.error("Failed to add sub-project:", err);
      }
    },
    [projects]
  );

  const selectProject = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const deleteProject = useCallback((id: string) => {
    unregisterProject(id).catch(() => {});
    setProjects((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        return updated[0]?.id ?? null;
      });
      return updated;
    });
  }, []);

  /* ── Var actions ─────────────────────────────────────── */
  const updateVar = useCallback(
    (varId: string, field: keyof EnvVar, value: string | boolean) => {
      if (!selectedId) return;
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          const newVars = p.vars.map((v) =>
            v.id !== varId ? v : { ...v, [field]: value }
          );
          return {
            ...p,
            vars: newVars,
            environments: p.environments.map((env) =>
              env.suffix === p.activeEnv ? { ...env, vars: newVars } : env
            ),
          };
        })
      );
    },
    [selectedId]
  );

  const addVar = useCallback(() => {
    if (!selectedId) return;
    const newVar: EnvVar = {
      id: crypto.randomUUID(),
      key: "",
      val: "",
      revealed: false,
      sourceProjectId: selectedId,
    };
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== selectedId) return p;
        const newVars = [...p.vars, newVar];
        return {
          ...p,
          vars: newVars,
          environments: p.environments.map((env) =>
            env.suffix === p.activeEnv ? { ...env, vars: newVars } : env
          ),
        };
      })
    );
    setSelectedVarId(newVar.id);
  }, [selectedId]);

  const deleteVar = useCallback(
    (varId: string) => {
      if (!selectedId) return;
      setProjects((prev) => {
        const updated = prev.map((p) => {
          if (p.id !== selectedId) return p;
          const newVars = p.vars.filter((v) => v.id !== varId);
          return {
            ...p,
            vars: newVars,
            environments: p.environments.map((env) =>
              env.suffix === p.activeEnv ? { ...env, vars: newVars } : env
            ),
          };
        });
        const project = updated.find((p) => p.id === selectedId);
        if (project) {
          saveProjectEnv(project.id, project.activeEnv, project.vars).catch(() => {});
        }
        return updated;
      });
      setSelectedVarId((cur) => (cur === varId ? null : cur));
    },
    [selectedId]
  );

  const toggleReveal = useCallback(
    (varId: string) => {
      if (!selectedId) return;
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          const newVars = p.vars.map((v) =>
            v.id !== varId ? v : { ...v, revealed: !v.revealed }
          );
          return {
            ...p,
            vars: newVars,
            environments: p.environments.map((env) =>
              env.suffix === p.activeEnv ? { ...env, vars: newVars } : env
            ),
          };
        })
      );
    },
    [selectedId]
  );

  const switchEnvironment = useCallback(async (suffix: string) => {
    const project = projects.find((p) => p.id === selectedId);
    if (!project || project.activeEnv === suffix) return;
    // Auto-save current env
    setSaveStatus("saving");
    await saveProjectEnv(project.id, project.activeEnv, project.vars).catch(() => {});
    // Load new env vars
    const newVars = await loadProjectEnv(project.id, suffix).catch(() => []);
    // Update project immutably
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== selectedId ? p : {
          ...p,
          activeEnv: suffix,
          vars: newVars,
          environments: p.environments.map((env) =>
            env.suffix === p.activeEnv ? { ...env, vars: p.vars } : env
          ),
        }
      )
    );
    // Update registry for shell hook
    if (project) {
      await registerProject({
        id: project.id, name: project.name, path: project.path, parentId: project.parentId, activeEnv: suffix,
      }).catch(() => {});
    }
    setSelectedVarId(null);
    setSaveStatus("idle");
  }, [projects, selectedId]);

  /* ── Settings actions ───────────────────────────────── */
  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY);
    window.location.reload();
  }, []);

  const clearAllData = useCallback(() => {
    projects.forEach((p) => unregisterProject(p.id).catch(() => {}));
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ONBOARDING_KEY);
    window.location.reload();
  }, [projects]);

  /* ── File I/O ────────────────────────────────────────── */
  const saveToFile = useCallback(async () => {
    const project = projects.find((p) => p.id === selectedId);
    if (!project) return;
    setSaveStatus("saving");
    try {
      await saveProjectEnv(project.id, project.activeEnv, project.vars);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [projects, selectedId]);

  /* ── Derived state ───────────────────────────────────── */
  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;
  const selectedVar =
    selectedProject?.vars.find((v) => v.id === selectedVarId) ?? null;
  const projectTree: ProjectTreeNode[] = buildProjectTree(projects);

  /* ── Render ──────────────────────────────────────────── */
  if (!onboardingComplete) {
    return <Onboarding onComplete={() => setOnboardingComplete(true)} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        projectTree={projectTree}
        selectedId={selectedId}
        onSelect={selectProject}
        onDelete={deleteProject}
        onAdd={addProject}
        onAddSubProject={addSubProject}
        onOpenShellIntegration={() => setShowShellIntegration(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <VarList
        project={selectedProject}
        selectedVarId={selectedVarId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectVar={setSelectedVarId}
        onAddVar={addVar}
        onDeleteVar={deleteVar}
      />

      {selectedProject ? (
        <VarDetail
          project={selectedProject}
          selectedVar={selectedVar}
          gitignoreStatus={gitignoreStatus}
          saveStatus={saveStatus}
          clipboardClearSeconds={appSettings.clipboardClearSeconds}
          environments={selectedProject.environments}
          activeEnv={selectedProject.activeEnv}
          onSwitchEnvironment={switchEnvironment}
          onUpdateVar={updateVar}
          onDeleteVar={deleteVar}
          onToggleReveal={toggleReveal}
          onAddVar={addVar}
          onSave={saveToFile}
        />
      ) : (
        <div className="detail-panel">
          <div className="empty-state">
            <div className="empty-state-icon">
              <FolderOpen size={26} />
            </div>
            <h2 className="empty-state-title">No project selected</h2>
            <p className="empty-state-desc">
              Choose a project folder that contains a{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: "0.85em" }}>.env</code>{" "}
              file. Your variables will appear here.
            </p>
            <button className="btn-primary" onClick={addProject}>
              <Plus size={14} />
              Add project folder
            </button>
          </div>
        </div>
      )}

      {showShellIntegration && (
        <div
          className="modal-overlay"
          onClick={() => setShowShellIntegration(false)}
          aria-label="Close shell integration dialog"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Shell integration"
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowShellIntegration(false)}
              aria-label="Close"
              className="modal-close"
            >
              <X size={14} />
            </button>
            <ShellIntegration />
          </div>
        </div>
      )}

      {showSettings && (
        <div
          className="modal-overlay"
          onClick={() => setShowSettings(false)}
          aria-label="Close settings dialog"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowSettings(false)}
              aria-label="Close"
              className="modal-close"
            >
              <X size={14} />
            </button>
            <SettingsPanel
              settings={appSettings}
              onChange={setAppSettings}
              onResetOnboarding={resetOnboarding}
              onClearAllData={clearAllData}
              onOpenShellIntegration={() => {
                setShowSettings(false);
                setShowShellIntegration(true);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
