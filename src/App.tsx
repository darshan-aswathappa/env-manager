import { useState, useEffect, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  saveProjectEnv,
  loadProjectEnv,
  importEnvFromProject,
  registerProject,
  unregisterProject,
  checkGitignoreStatus,
} from "./lib/envFile";
import { buildProjectTree } from "./lib/projectTree";
import type { Project, EnvVar, ProjectTreeNode, GitignoreStatus } from "./types";
import Sidebar from "./components/Sidebar";
import VarList from "./components/VarList";
import VarDetail from "./components/VarDetail";
import ShellIntegration from "./components/ShellIntegration";
import { FolderOpen, Plus, X } from "lucide-react";

const STORAGE_KEY = "dotenv_mgr_projects";
type SaveStatus = "idle" | "saving" | "saved" | "error";

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Project[];
    // Migrate legacy projects missing new fields
    return parsed.map((p) => ({
      parentId: null,
      inheritanceMode: "merge-child-wins" as const,
      sortOrder: 0,
      ...p,
      vars: (p.vars || []).map((v) => ({
        sourceProjectId: p.id,
        ...v,
        val: "", // val is never stored in localStorage
        revealed: false,
      })),
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
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => loadProjects()[0]?.id ?? null
  );
  const [selectedVarId, setSelectedVarId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const [gitignoreStatus, setGitignoreStatus] = useState<GitignoreStatus>('no_gitignore');
  const [showShellIntegration, setShowShellIntegration] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  /* Sync to localStorage */
  useEffect(() => {
    persistProjects(projects);
  }, [projects]);

  /* Load vars per project from app data on mount and when project list changes */
  useEffect(() => {
    let cancelled = false;
    async function loadAllVars() {
      for (const project of projects) {
        if (cancelled) break;
        try {
          const vars = await loadProjectEnv(project.id);
          if (cancelled) break;
          if (vars.length > 0) {
            setProjects((prev) =>
              prev.map((p) => (p.id === project.id ? { ...p, vars } : p))
            );
          }
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
      const newProject: Project = {
        id: crypto.randomUUID(),
        name,
        path: dirPath,
        parentId: null,
        vars: [],
        inheritanceMode: "merge-child-wins",
        sortOrder: 0,
      };
      // Register in Tauri app data registry
      await registerProject({
        id: newProject.id,
        name: newProject.name,
        path: dirPath,
        parentId: null,
      }).catch(() => {});
      // Import existing .env vars from project folder
      const vars = await importEnvFromProject(dirPath).catch(() => []);
      if (vars.length > 0) {
        newProject.vars = vars;
        await saveProjectEnv(newProject.id, vars).catch(() => {});
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
        const newProject: Project = {
          id: crypto.randomUUID(),
          name,
          path: dirPath,
          parentId,
          vars: [],
          inheritanceMode: "merge-child-wins",
          sortOrder: (parent?.vars?.length ?? 0),
        };
        await registerProject({
          id: newProject.id,
          name: newProject.name,
          path: dirPath,
          parentId,
        }).catch(() => {});
        const vars = await importEnvFromProject(dirPath).catch(() => []);
        if (vars.length > 0) {
          newProject.vars = vars;
          await saveProjectEnv(newProject.id, vars).catch(() => {});
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
        prev.map((p) =>
          p.id !== selectedId
            ? p
            : {
                ...p,
                vars: p.vars.map((v) =>
                  v.id !== varId ? v : { ...v, [field]: value }
                ),
              }
        )
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
      prev.map((p) =>
        p.id !== selectedId ? p : { ...p, vars: [...p.vars, newVar] }
      )
    );
    setSelectedVarId(newVar.id);
  }, [selectedId]);

  const deleteVar = useCallback(
    (varId: string) => {
      if (!selectedId) return;
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== selectedId
            ? p
            : { ...p, vars: p.vars.filter((v) => v.id !== varId) }
        )
      );
      setSelectedVarId((cur) => (cur === varId ? null : cur));
    },
    [selectedId]
  );

  const toggleReveal = useCallback(
    (varId: string) => {
      if (!selectedId) return;
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== selectedId
            ? p
            : {
                ...p,
                vars: p.vars.map((v) =>
                  v.id !== varId ? v : { ...v, revealed: !v.revealed }
                ),
              }
        )
      );
    },
    [selectedId]
  );

  /* ── File I/O ────────────────────────────────────────── */
  const saveToFile = useCallback(async () => {
    const project = projects.find((p) => p.id === selectedId);
    if (!project) return;
    setSaveStatus("saving");
    try {
      await saveProjectEnv(project.id, project.vars);
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
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setShowShellIntegration(false)}
          aria-label="Close shell integration dialog"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Shell integration"
            style={{
              position: "relative",
              width: "640px",
              maxWidth: "calc(100vw - 48px)",
              maxHeight: "80vh",
              overflowY: "auto",
              background: "#0d0d0d",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: "12px",
              padding: "24px",
              zIndex: 101,
              boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowShellIntegration(false)}
              aria-label="Close"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "28px",
                height: "28px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--text-secondary)",
                padding: 0,
                lineHeight: 1,
              }}
            >
              <X size={14} />
            </button>
            <ShellIntegration />
          </div>
        </div>
      )}
    </div>
  );
}
