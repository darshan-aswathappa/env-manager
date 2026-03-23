import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readEnvFile, writeEnvFile, checkGitignore } from "./lib/envFile";
import type { Project, EnvVar } from "./types";

const STORAGE_KEY = "dotenv_mgr_projects";

type SaveStatus = "idle" | "saving" | "saved" | "error";

/* ── Persistence helpers ──────────────────────────────────── */
function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}

function persistProjects(projects: Project[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

/* ── Icon components (inline SVG via JSX) ─────────────────── */
const IconEye = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconEyeOff = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/>
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/>
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>
    <line x1="2" y1="2" x2="22" y2="22"/>
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6M14 11v6"/>
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);

const IconSave = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
    <polyline points="17 21 17 13 7 13 7 21"/>
    <polyline points="7 3 7 8 15 8"/>
  </svg>
);

const IconFolder = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
  </svg>
);

const IconShield = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconCheck = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const Spinner = () => (
  <span className="spinner" aria-hidden="true" />
);

/* ═══════════════════════════════════════════════════════════ */
/*  App Component                                              */
/* ═══════════════════════════════════════════════════════════ */
export default function App() {
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [selectedId, setSelectedId] = useState<string | null>(
    () => loadProjects()[0]?.id ?? null
  );
  const [gitignoreOk, setGitignoreOk] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [searchQuery, setSearchQuery] = useState("");

  /* Sync to localStorage whenever projects change */
  useEffect(() => {
    persistProjects(projects);
  }, [projects]);

  /* Refresh gitignore status when the selected project changes */
  useEffect(() => {
    const project = projects.find((p) => p.id === selectedId);
    if (!project) {
      setGitignoreOk(false);
      return;
    }
    checkGitignore(project.path)
      .then(setGitignoreOk)
      .catch(() => setGitignoreOk(false));
  }, [selectedId, projects]);

  /* ── Project actions ──────────────────────────────────── */
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
      const vars = await readEnvFile(dirPath);
      const newProject: Project = {
        id: crypto.randomUUID(),
        name,
        path: dirPath,
        vars,
      };
      setProjects((prev) => [...prev, newProject]);
      setSelectedId(newProject.id);
    } catch (err) {
      console.error("Failed to add project:", err);
    }
  }, []);

  const selectProject = useCallback((id: string) => {
    setSelectedId(id);
    setSaveStatus("idle");
    setSearchQuery("");
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      setSelectedId((cur) => {
        if (cur !== id) return cur;
        return updated[0]?.id ?? null;
      });
      return updated;
    });
  }, []);

  /* ── Var actions ──────────────────────────────────────── */
  const updateVar = useCallback(
    (projectId: string, varId: string, field: keyof EnvVar, value: string | boolean) => {
      setProjects((prev) =>
        prev.map((p) =>
          p.id !== projectId
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
    []
  );

  const addVar = useCallback((projectId: string) => {
    const newVar: EnvVar = {
      id: crypto.randomUUID(),
      key: "",
      val: "",
      revealed: false,
    };
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId ? p : { ...p, vars: [...p.vars, newVar] }
      )
    );
  }, []);

  const deleteVar = useCallback((projectId: string, varId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId
          ? p
          : { ...p, vars: p.vars.filter((v) => v.id !== varId) }
      )
    );
  }, []);

  const toggleReveal = useCallback((projectId: string, varId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              vars: p.vars.map((v) =>
                v.id !== varId ? v : { ...v, revealed: !v.revealed }
              ),
            }
      )
    );
  }, []);

  /* ── File I/O ─────────────────────────────────────────── */
  const saveToFile = useCallback(async () => {
    const project = projects.find((p) => p.id === selectedId);
    if (!project) return;
    setSaveStatus("saving");
    try {
      await writeEnvFile(project.path, project.vars);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [projects, selectedId]);

  /* ── Derived state ────────────────────────────────────── */
  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  const filteredVars: EnvVar[] = selectedProject
    ? searchQuery.trim()
      ? selectedProject.vars.filter(
          (v) =>
            v.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
            v.val.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : selectedProject.vars
    : [];

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="app-shell">

      {/* ════════════════════ Sidebar ════════════════════ */}
      <aside className="sidebar">

        <div className="sidebar-header">
          <div className="app-logo">
            <div className="app-logo-icon" aria-hidden="true">
              <IconFolder />
            </div>
            <span className="app-title">dotenv</span>
          </div>
          <div className="app-subtitle">Manager</div>
        </div>

        <div className="sidebar-section-label">Projects</div>

        <div className="sidebar-list" role="list">
          {projects.length === 0 && (
            <p style={{
              padding: "var(--sp-3) var(--sp-2)",
              color: "var(--text-muted)",
              fontSize: "var(--text-xs)",
              textAlign: "center",
              lineHeight: 1.6,
            }}>
              No projects yet.
              <br />
              Add a folder below.
            </p>
          )}

          {projects.map((project, index) => (
            <div
              key={project.id}
              className={`project-item${selectedId === project.id ? " active" : ""}`}
              style={{ animationDelay: `${index * 40}ms` }}
              onClick={() => selectProject(project.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectProject(project.id);
                }
              }}
              aria-label={`Select project ${project.name}`}
              aria-selected={selectedId === project.id}
            >
              <span className="project-item-dot" aria-hidden="true" />
              <div className="project-item-info">
                <div className="project-item-name">{project.name}</div>
                <div className="project-item-count">
                  {project.vars.length} var{project.vars.length !== 1 ? "s" : ""}
                </div>
              </div>
              <button
                className="project-item-delete btn-icon"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteProject(project.id);
                }}
                aria-label={`Remove project ${project.name}`}
                title="Remove project"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button
            className="btn btn-ghost btn-block"
            onClick={addProject}
            aria-label="Add project folder"
          >
            <IconPlus />
            Add project
          </button>
        </div>
      </aside>

      {/* ════════════════════ Main Panel ════════════════════ */}
      <main className="main-panel">
        {selectedProject ? (
          <>
            {/* Header */}
            <header className="main-header">
              <div className="main-header-info">
                <h1 className="main-header-title">{selectedProject.name}</h1>
                <div className="main-header-path">
                  {selectedProject.path}/.env
                </div>
              </div>
              <div className="main-header-actions">
                {gitignoreOk ? (
                  <span className="badge badge-success" title=".env is listed in .gitignore">
                    <span className="badge-dot" />
                    <IconShield />
                    gitignored
                  </span>
                ) : (
                  <span className="badge badge-warning" title=".env is NOT in .gitignore — risk of leaking secrets">
                    <span className="badge-dot" />
                    not gitignored
                  </span>
                )}
                <span className="var-count" aria-label={`${selectedProject.vars.length} variables`}>
                  {selectedProject.vars.length}
                </span>
              </div>
            </header>

            {/* Search bar */}
            <div className="search-bar">
              <input
                className="input-field input-search"
                type="search"
                placeholder="Search variables…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search environment variables"
              />
            </div>

            {/* Variable rows */}
            <div
              className="env-table-wrap"
              role="list"
              aria-label="Environment variables"
            >
              {/* Column labels */}
              {filteredVars.length > 0 && (
                <div className="env-table-header" aria-hidden="true">
                  <span className="env-table-header-label">Key</span>
                  <span />
                  <span className="env-table-header-label">Value</span>
                  <span />
                  <span />
                </div>
              )}

              {/* Empty / no-results states */}
              {filteredVars.length === 0 && searchQuery && (
                <div className="no-results">
                  <span className="no-results-icon" aria-hidden="true">⌖</span>
                  No variables match &ldquo;{searchQuery}&rdquo;
                </div>
              )}
              {filteredVars.length === 0 && !searchQuery && (
                <div className="no-results">
                  <span className="no-results-icon" aria-hidden="true">✦</span>
                  No variables — click <strong style={{ color: "var(--text-secondary)" }}>Add variable</strong> below
                </div>
              )}

              {/* Env var rows */}
              {filteredVars.map((v, index) => (
                <div
                  key={v.id}
                  className="env-row"
                  style={{ animationDelay: `${index * 25}ms` }}
                  role="listitem"
                >
                  {/* Key */}
                  <input
                    className="input-field input-mono input-key"
                    type="text"
                    placeholder="VARIABLE_NAME"
                    value={v.key}
                    onChange={(e) =>
                      updateVar(selectedProject.id, v.id, "key", e.target.value)
                    }
                    spellCheck={false}
                    autoComplete="off"
                    aria-label="Variable key"
                  />

                  {/* = separator */}
                  <span className="env-separator" aria-hidden="true">=</span>

                  {/* Value */}
                  <input
                    className="input-field input-mono input-val"
                    type={v.revealed ? "text" : "password"}
                    placeholder="value"
                    value={v.val}
                    onChange={(e) =>
                      updateVar(selectedProject.id, v.id, "val", e.target.value)
                    }
                    spellCheck={false}
                    autoComplete="off"
                    aria-label={`Value for ${v.key || "variable"}`}
                  />

                  {/* Reveal toggle */}
                  <button
                    className="btn-icon"
                    onClick={() => toggleReveal(selectedProject.id, v.id)}
                    title={v.revealed ? "Hide value" : "Reveal value"}
                    aria-label={
                      v.revealed
                        ? `Hide value of ${v.key}`
                        : `Reveal value of ${v.key}`
                    }
                    aria-pressed={v.revealed}
                  >
                    {v.revealed ? <IconEyeOff /> : <IconEye />}
                  </button>

                  {/* Delete */}
                  <button
                    className="btn-icon btn-icon-danger"
                    onClick={() => deleteVar(selectedProject.id, v.id)}
                    title="Delete variable"
                    aria-label={`Delete variable ${v.key}`}
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <footer className="env-footer">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => addVar(selectedProject.id)}
                aria-label="Add new variable"
              >
                <IconPlus />
                Add variable
              </button>

              <div style={{ flex: 1 }} />

              {/* Save status */}
              {saveStatus === "saving" && (
                <span
                  className="save-status save-status-saving"
                  role="status"
                  aria-live="polite"
                >
                  <Spinner />
                  Saving…
                </span>
              )}
              {saveStatus === "saved" && (
                <span
                  className="save-status save-status-saved"
                  role="status"
                  aria-live="polite"
                >
                  <IconCheck />
                  Saved
                </span>
              )}
              {saveStatus === "error" && (
                <span
                  className="save-status save-status-error"
                  role="alert"
                  aria-live="assertive"
                >
                  Save failed
                </span>
              )}

              <button
                className="btn btn-primary btn-sm"
                onClick={saveToFile}
                disabled={saveStatus === "saving"}
                aria-label="Save .env file to disk"
              >
                <IconSave />
                Save to disk
              </button>
            </footer>
          </>
        ) : (
          /* Welcome / empty state */
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">
              <IconFolder />
            </div>
            <h2 className="empty-state-title">No project selected</h2>
            <p className="empty-state-desc">
              Add a project folder from the sidebar to start managing your{" "}
              <code
                className="gradient-text"
                style={{ fontFamily: "var(--font-mono)", fontSize: "0.9em" }}
              >
                .env
              </code>{" "}
              variables.
            </p>
            <button
              className="btn btn-primary"
              onClick={addProject}
              aria-label="Add a project folder"
            >
              <IconFolder />
              Add project folder
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
