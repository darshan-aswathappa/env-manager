import { useState, useEffect, useCallback, useRef, Component } from "react";
import type { ReactNode } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  saveProjectEnv,
  loadProjectEnv,
  importAllEnvsFromProject,
  registerProject,
  unregisterProject,
  checkGitignoreStatus,
  writeEnvSignal,
  checkShellIntegration,
  applyPushResultToProject,
  findKeyAcrossEnvironments,
  propagateKeyRenameToEnvironments,
  checkEnvExample,
} from "./lib/envFile";
import { buildExampleImportPlan } from "./lib/envFormats";
import EnvExamplePromptDialog from "./components/EnvExample/EnvExamplePromptDialog";
import type { ShellIntegrationStatus } from "./lib/envFile";
import { buildProjectTree } from "./lib/projectTree";
import type { Project, EnvVar, ProjectTreeNode, GitignoreStatus, AppSettings, Environment, EnvExampleFile } from "./types";
import { ENV_SUFFIXES } from "./types";
import Sidebar from "./components/Sidebar";
import VarList from "./components/VarList";
import VarDetail from "./components/VarDetail";
import ShellIntegration from "./components/ShellIntegration";
import SettingsPanel from "./components/Settings";
import Onboarding from "./components/Onboarding";
import PushToStagePanel from "./components/PushToStage/PushToStagePanel";
import DiffViewPanel from "./components/DiffView/DiffViewPanel";
import ImportDialog from "./components/Import/ImportDialog";
import ExportPanel from "./components/Export/ExportPanel";
import { Plus, X } from "lucide-react";

// ── Error Boundary ─────────────────────────────────────────────────────────
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell" style={{ background: 'var(--bg-base)' }}>
          <div className="detail-panel">
            <div className="empty-state">
              <h2 className="empty-state-title">Something went wrong</h2>
              <p className="empty-state-desc">
                An unexpected error occurred. Reload to recover your session.
              </p>
              <button className="btn-primary" onClick={() => window.location.reload()}>
                Reload app
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const STORAGE_KEY = "dotenv_mgr_projects";
const ONBOARDING_KEY = "dotenv_mgr_onboarding";
const SETTINGS_KEY = "dotenv_mgr_settings";
const EXAMPLE_DISMISSED_KEY = 'dotenv_mgr_example_dismissed';

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

interface PendingExampleImport {
  project: Project
  exampleFile: EnvExampleFile
}

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
  const [shellStatus, setShellStatus] = useState<ShellIntegrationStatus>("not_found");
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(loadSettings);
  const [showPushPanel, setShowPushPanel] = useState(false);
  const [showDiffPanel, setShowDiffPanel] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [_pushUndoSnapshot, setPushUndoSnapshot] = useState<{
    projectId: string;
    suffix: string;
    snapshot: string;
  } | null>(null);
  const [pendingKeyRename, setPendingKeyRename] = useState<{
    varId: string;
    oldKey: string;
    newKey: string;
    affectedSuffixes: string[];
  } | null>(null);
  const [selectedVarOriginalKey, setSelectedVarOriginalKey] = useState<string | null>(null);
  const [pendingExampleImport, setPendingExampleImport] = useState<PendingExampleImport | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const settingsDialogRef = useRef<HTMLDivElement>(null);
  const autoMaskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Auto-focus modals/panels when they open */
  useEffect(() => {
    if (showShellIntegration) dialogRef.current?.focus();
  }, [showShellIntegration]);

  useEffect(() => {
    if (showSettings) settingsDialogRef.current?.focus();
  }, [showSettings]);

  /* Sync to localStorage */
  useEffect(() => {
    persistProjects(projects);
  }, [projects]);

  /* Persist settings */
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  }, [appSettings]);

  /* Check shell integration status */
  useEffect(() => {
    checkShellIntegration()
      .then(setShellStatus)
      .catch(() => setShellStatus("not_found"));
  }, [selectedId]);

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

  /* Global keyboard shortcuts */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        const proj = projects.find((p) => p.id === selectedId) ?? null;
        if (proj && proj.vars.length > 0) {
          setShowPushPanel(true);
        }
      }
      // Cmd+D: toggle diff panel (guard: project selected + >= 2 envs with vars)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'd') {
        e.preventDefault();
        const proj = projects.find((p) => p.id === selectedId) ?? null;
        const envsWithVars = proj?.environments.filter((env) => env.vars.length > 0) ?? [];
        if (proj && envsWithVars.length >= 2) {
          if (showDiffPanel) {
            setShowDiffPanel(false);
          } else {
            setShowPushPanel(false); // mutual exclusion
            setShowDiffPanel(true);
          }
        }
      }
      // Cmd+I: open import dialog
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'i') {
        e.preventDefault();
        const proj = projects.find((p) => p.id === selectedId) ?? null;
        if (proj) {
          setShowExportPanel(false);
          setShowImportDialog(true);
        }
      }
      // Cmd+E: open export panel
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'e') {
        e.preventDefault();
        const proj = projects.find((p) => p.id === selectedId) ?? null;
        if (proj && proj.vars.length > 0) {
          setShowImportDialog(false);
          setShowExportPanel(true);
        }
      }
      // Escape: close import dialog or export panel
      if (e.key === 'Escape') {
        if (showImportDialog) setShowImportDialog(false);
        if (showExportPanel) setShowExportPanel(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [projects, selectedId, showDiffPanel, showImportDialog, showExportPanel]);

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

  /* Snapshot original key when a var is selected — intentionally does NOT include
     selectedProject.vars to avoid resetting the original key while the user types */
  useEffect(() => {
    const v = selectedProject?.vars.find(v => v.id === selectedVarId);
    setSelectedVarOriginalKey(v?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVarId]);

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
      // Check for .env.example — non-blocking, fires after project is in state
      setTimeout(async () => {
        try {
          const exampleFile = await checkEnvExample(dirPath).catch(() => null)
          if (!exampleFile) return
          const plan = buildExampleImportPlan(exampleFile, newProject.vars)
          if (plan.newCount === 0) return
          const dismissedRaw = localStorage.getItem(EXAMPLE_DISMISSED_KEY)
          const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : []
          if (dismissed.includes(newProject.id)) return
          setPendingExampleImport({ project: newProject, exampleFile })
        } catch {
          // silently swallow — must never break project-add flow
        }
      }, 320)
    } catch {
      /* project add failed — user sees no project added */
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
        // Check for .env.example — non-blocking
        setTimeout(async () => {
          try {
            const exampleFile = await checkEnvExample(dirPath).catch(() => null)
            if (!exampleFile) return
            const plan = buildExampleImportPlan(exampleFile, newProject.vars)
            if (plan.newCount === 0) return
            const dismissedRaw = localStorage.getItem(EXAMPLE_DISMISSED_KEY)
            const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : []
            if (dismissed.includes(newProject.id)) return
            setPendingExampleImport({ project: newProject, exampleFile })
          } catch {
            // silently swallow
          }
        }, 320)
      } catch {
        /* sub-project add failed — user sees no project added */
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
          const validVars = project.vars.filter((v) => v.key.trim() !== "");
          saveProjectEnv(project.id, project.activeEnv, validVars).catch(() => {});
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
    setPendingKeyRename(null);
    // Auto-save current env (skip vars with empty keys)
    setSaveStatus("saving");
    const validVars = project.vars.filter((v) => v.key.trim() !== "");
    await saveProjectEnv(project.id, project.activeEnv, validVars).catch(() => {});
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
    // Signal terminal to reload env vars
    await writeEnvSignal().catch(() => {});
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
      const varsToSave = project.vars.filter((v) => v.key.trim() !== "");
      await saveProjectEnv(project.id, project.activeEnv, varsToSave);
      // Detect key rename after saving active env
      if (selectedVarId && selectedVarOriginalKey !== null && selectedVarOriginalKey.trim() !== "") {
        const renamedVar = project.vars.find((v) => v.id === selectedVarId);
        if (renamedVar && renamedVar.key !== selectedVarOriginalKey) {
          const affectedSuffixes = findKeyAcrossEnvironments(
            selectedVarOriginalKey,
            project.environments,
            project.activeEnv
          );
          if (affectedSuffixes.length > 0) {
            setPendingKeyRename({
              varId: selectedVarId,
              oldKey: selectedVarOriginalKey,
              newKey: renamedVar.key,
              affectedSuffixes,
            });
          }
        }
      }
      // Reset original key tracking to current key after save
      const currentVar = project.vars.find((v) => v.id === selectedVarId);
      setSelectedVarOriginalKey(currentVar?.key ?? null);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      /* save failed — user sees error status in footer */
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [projects, selectedId, selectedVarId, selectedVarOriginalKey]);

  /* ── Key rename propagation ──────────────────────────── */
  const handlePropagateKeyRename = useCallback(async () => {
    if (!selectedId || !pendingKeyRename) return;
    const { oldKey, newKey, affectedSuffixes } = pendingKeyRename;
    const project = projects.find((p) => p.id === selectedId);
    if (project) {
      const updatedEnvironments = propagateKeyRenameToEnvironments(
        oldKey, newKey, project.environments, affectedSuffixes
      );
      setProjects((prev) => prev.map((p) => {
        if (p.id !== selectedId) return p;
        return {
          ...p,
          environments: updatedEnvironments,
          vars: affectedSuffixes.includes(p.activeEnv)
            ? (updatedEnvironments.find((e) => e.suffix === p.activeEnv)?.vars ?? p.vars)
            : p.vars,
        };
      }));
      await Promise.all(
        affectedSuffixes.map((suffix) => {
          const env = updatedEnvironments.find((e) => e.suffix === suffix);
          if (env) return saveProjectEnv(project.id, suffix, env.vars).catch(() => {});
          return Promise.resolve();
        })
      );
    }
    setPendingKeyRename(null);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [selectedId, pendingKeyRename, projects]);

  /* ── Push to stage ───────────────────────────────────── */
  const handlePushComplete = useCallback(
    (targetSuffix: string, updatedVars: EnvVar[], snapshot: string | null) => {
      if (!selectedId) return;
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          return applyPushResultToProject(p, targetSuffix, updatedVars);
        })
      );
      setShowPushPanel(false);
      if (snapshot !== null) {
        setPushUndoSnapshot({ projectId: selectedId, suffix: targetSuffix, snapshot });
      }
    },
    [selectedId]
  );

  /* ── Diff panel push complete ────────────────────────── */
  const handleDiffPushComplete = useCallback(
    (targetSuffix: string, updatedVars: EnvVar[], snapshot: string | null) => {
      if (!selectedId) return;
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedId) return p;
          return applyPushResultToProject(p, targetSuffix, updatedVars);
        })
      );
      if (snapshot !== null) {
        setPushUndoSnapshot({ projectId: selectedId, suffix: targetSuffix, snapshot });
      }
    },
    [selectedId]
  );

  /* ── Import complete ─────────────────────────────────── */
  const handleImportComplete = useCallback((mergedVars: EnvVar[]) => {
    if (!selectedId) return;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== selectedId) return p;
        return {
          ...p,
          vars: mergedVars,
          environments: p.environments.map((env) =>
            env.suffix === p.activeEnv ? { ...env, vars: mergedVars } : env
          ),
        };
      })
    );
    setShowImportDialog(false);
  }, [selectedId]);

  /* ── Example import ─────────────────────────────────── */
  const handleExampleImportComplete = useCallback((targetSuffix: string, mergedVars: EnvVar[]) => {
    if (!pendingExampleImport) return
    const { project } = pendingExampleImport
    setProjects(prev =>
      prev.map(p => {
        if (p.id !== project.id) return p
        return {
          ...p,
          vars: project.activeEnv === targetSuffix ? mergedVars : p.vars,
          environments: p.environments.map(env =>
            env.suffix === targetSuffix ? { ...env, vars: mergedVars } : env
          ),
        }
      })
    )
    saveProjectEnv(project.id, targetSuffix, mergedVars).catch(() => {})
    setPendingExampleImport(null)
  }, [pendingExampleImport])

  const handleExampleDismiss = useCallback((projectId: string) => {
    const dismissedRaw = localStorage.getItem(EXAMPLE_DISMISSED_KEY)
    const dismissed: string[] = dismissedRaw ? JSON.parse(dismissedRaw) : []
    if (!dismissed.includes(projectId)) {
      dismissed.push(projectId)
      localStorage.setItem(EXAMPLE_DISMISSED_KEY, JSON.stringify(dismissed))
    }
  }, [])

  const triggerExampleImport = useCallback(async (project: Project) => {
    try {
      const exampleFile = await checkEnvExample(project.path).catch(() => null)
      if (!exampleFile) return
      const plan = buildExampleImportPlan(exampleFile, project.vars)
      if (plan.newCount === 0) return
      setPendingExampleImport({ project, exampleFile })
    } catch {
      // silently swallow
    }
  }, [])

  /* ── Derived state ───────────────────────────────────── */
  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;
  const selectedVar =
    selectedProject?.vars.find((v) => v.id === selectedVarId) ?? null;
  const projectTree: ProjectTreeNode[] = buildProjectTree(projects);

  /* ── Render ──────────────────────────────────────────── */
  if (!onboardingComplete) {
    return (
      <ErrorBoundary>
        <Onboarding onComplete={() => setOnboardingComplete(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
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
        onImportFromExample={triggerExampleImport}
      />

      <VarList
        project={selectedProject}
        selectedVarId={selectedVarId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectVar={setSelectedVarId}
        onAddVar={addVar}
        onDeleteVar={deleteVar}
        onOpenImport={selectedProject ? () => { setShowExportPanel(false); setShowImportDialog(true); } : undefined}
        onOpenExport={selectedProject ? () => { setShowImportDialog(false); setShowExportPanel(true); } : undefined}
        onImportFromExample={selectedProject ? () => triggerExampleImport(selectedProject) : undefined}
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
          shellStatus={shellStatus}
          onSwitchEnvironment={switchEnvironment}
          onUpdateVar={updateVar}
          onDeleteVar={deleteVar}
          onToggleReveal={toggleReveal}
          onSave={saveToFile}
          onOpenShellIntegration={() => setShowShellIntegration(true)}
          onOpenPush={selectedProject.vars.length > 0 ? () => setShowPushPanel(true) : null}
          onOpenDiff={
            (selectedProject.environments.filter((e) => e.vars.length > 0).length >= 2)
              ? () => { setShowPushPanel(false); setShowDiffPanel(true); }
              : null
          }
          renamePrompt={pendingKeyRename ? {
            oldKey: pendingKeyRename.oldKey,
            newKey: pendingKeyRename.newKey,
            affectedSuffixes: pendingKeyRename.affectedSuffixes,
          } : null}
          onPropagateRename={handlePropagateKeyRename}
          onDismissRename={() => setPendingKeyRename(null)}
        />
      ) : (
        <div className="detail-panel">
          <div className="empty-state">
            <h2 className="empty-state-title">No project selected</h2>
            <p className="empty-state-desc">
              Open a project folder that contains a{" "}
              <code className="inline-code">.env</code>{" "}
              file.
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
          onKeyDown={(e) => { if (e.key === "Escape") setShowShellIntegration(false); }}
          tabIndex={-1}
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Shell integration"
            className="modal-dialog"
            tabIndex={-1}
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
          onKeyDown={(e) => { if (e.key === "Escape") setShowSettings(false); }}
          tabIndex={-1}
          role="presentation"
        >
          <div
            ref={settingsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Settings"
            className="modal-dialog"
            tabIndex={-1}
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
            />
          </div>
        </div>
      )}

      {showPushPanel && selectedProject && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.15)',
            display: 'flex', justifyContent: 'flex-end',
            animation: 'fadeIn var(--t-normal) both',
          }}
          onClick={() => setShowPushPanel(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowPushPanel(false); }}
          tabIndex={-1}
          role="presentation"
          data-testid="push-panel-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <PushToStagePanel
              project={selectedProject}
              sourceSuffix={selectedProject.activeEnv}
              onClose={() => setShowPushPanel(false)}
              onPushComplete={handlePushComplete}
            />
          </div>
        </div>
      )}

      {showDiffPanel && selectedProject && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.15)',
            display: 'flex', justifyContent: 'flex-end',
            animation: 'fadeIn var(--t-normal) both',
          }}
          onClick={() => setShowDiffPanel(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setShowDiffPanel(false); }}
          tabIndex={-1}
          role="presentation"
          data-testid="diff-panel-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <DiffViewPanel
              project={selectedProject}
              initialLeftSuffix={selectedProject.activeEnv}
              onClose={() => setShowDiffPanel(false)}
              onPushComplete={handleDiffPushComplete}
            />
          </div>
        </div>
      )}

      {showImportDialog && selectedProject && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn var(--t-normal) both',
          }}
          onClick={() => setShowImportDialog(false)}
          role="presentation"
          data-testid="import-dialog-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ImportDialog
              project={selectedProject}
              onClose={() => setShowImportDialog(false)}
              onImportComplete={handleImportComplete}
            />
          </div>
        </div>
      )}

      {showExportPanel && selectedProject && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.15)',
            display: 'flex', justifyContent: 'flex-end',
            animation: 'fadeIn var(--t-normal) both',
          }}
          onClick={() => setShowExportPanel(false)}
          role="presentation"
          data-testid="export-panel-backdrop"
        >
          <div onClick={(e) => e.stopPropagation()}>
            <ExportPanel
              project={selectedProject}
              onClose={() => setShowExportPanel(false)}
              onSaveComplete={() => setShowExportPanel(false)}
            />
          </div>
        </div>
      )}
      {pendingExampleImport && (
        <EnvExamplePromptDialog
          project={pendingExampleImport.project}
          exampleFile={pendingExampleImport.exampleFile}
          onImportComplete={handleExampleImportComplete}
          onDismiss={handleExampleDismiss}
          onClose={() => setPendingExampleImport(null)}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}
