import { useState, useEffect } from "react";
import { Search, ChevronRight, Plus, Trash2, Upload, Download } from "lucide-react";
import type { EnvVar, Project } from "../types";

interface VarListProps {
  project: Project | null;
  selectedVarId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectVar: (id: string) => void;
  onAddVar: () => void;
  onDeleteVar: (id: string) => void;
  onOpenImport?: () => void;
  onOpenExport?: () => void;
  onImportFromExample?: () => void;
}

function valuePreview(v: EnvVar): string {
  if (!v.val) return "";
  if (!v.revealed) return "••••••••";
  return v.val.length > 28 ? v.val.slice(0, 28) + "…" : v.val;
}

export default function VarList({
  project,
  selectedVarId,
  searchQuery,
  onSearchChange,
  onSelectVar,
  onAddVar,
  onDeleteVar,
  onOpenImport,
  onOpenExport,
  onImportFromExample,
}: VarListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    setPendingDeleteId(null);
  }, [project?.id]);

  if (!project) {
    return (
      <div className="list-panel" style={{ justifyContent: "center", alignItems: "center", display: "flex" }}>
        <div className="list-empty">
          <span>Select a project</span>
        </div>
      </div>
    );
  }

  const q = searchQuery.trim().toLowerCase();
  const filtered = q
    ? project.vars.filter((v) => v.key.toLowerCase().includes(q))
    : project.vars;

  return (
    <div className="list-panel">
      {/* Variables toolbar */}
      <div className="varlist-toolbar">
        <span className="varlist-toolbar__label">Variables</span>
        <div className="varlist-toolbar__actions">
          <button
            className="varlist-toolbar__btn"
            onClick={onOpenImport}
            aria-label="Import variables"
            title="Import variables (⌘I)"
            disabled={!onOpenImport}
          >
            <Upload size={13} />
          </button>
          <button
            className="varlist-toolbar__btn"
            onClick={onOpenExport}
            aria-label="Export variables"
            title="Export variables (⌘E)"
            disabled={!onOpenExport}
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="search-wrap">
        <div className="search-input-wrap">
          <span className="search-icon" aria-hidden="true">
            <Search size={13} />
          </span>
          <input
            className="search-input"
            type="search"
            placeholder="Search variables…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search environment variables"
            spellCheck={false}
          />
        </div>
      </div>

      {/* List */}
      <div className="var-list" role="list">
        {filtered.length === 0 && searchQuery && (
          <div className="list-empty">
            <span>No results for "{searchQuery.length > 40 ? searchQuery.slice(0, 40) + "…" : searchQuery}"</span>
          </div>
        )}

        {filtered.length === 0 && !searchQuery && (
          <div className="list-empty">
            <span>No variables yet.</span>
            <span>Click + below to add one.</span>
            {onImportFromExample && (
              <button
                className="list-empty-action"
                onClick={onImportFromExample}
                style={{ marginTop: 4 }}
                aria-label="Import from .env.example"
              >
                Import from .env.example
              </button>
            )}
          </div>
        )}

        {filtered.map((v, index) => {
          const confirming = pendingDeleteId === v.id;
          return (
            <div
              key={v.id}
              className={`var-list-item${selectedVarId === v.id ? " active" : ""}${confirming ? " confirming" : ""}`}
              style={{
                '--item-index': Math.min(index, 8),
              } as React.CSSProperties}
              onClick={() => { if (!confirming) onSelectVar(v.id); }}
              role="listitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (confirming) {
                  if (e.key === "Escape") { e.preventDefault(); setPendingDeleteId(null); }
                  return;
                }
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectVar(v.id);
                }
              }}
              aria-label={v.key || "Unnamed variable"}
              aria-current={selectedVarId === v.id ? "true" : undefined}
            >
              {confirming ? (
                <>
                  <span className="var-list-confirm-label">Delete <strong>{v.key || "this variable"}</strong>?</span>
                  <div className="var-list-confirm-actions">
                    <button
                      className="var-list-confirm-cancel"
                      onClick={(e) => { e.stopPropagation(); setPendingDeleteId(null); }}
                      aria-label="Cancel delete"
                    >
                      Cancel
                    </button>
                    <button
                      className="var-list-confirm-delete"
                      onClick={(e) => { e.stopPropagation(); setPendingDeleteId(null); onDeleteVar(v.id); }}
                      aria-label={`Confirm delete ${v.key || "variable"}`}
                    >
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span
                    className="var-list-icon"
                    aria-hidden="true"
                  />
                  <div className="var-list-body">
                    <div className="var-list-key">{v.key || <em style={{ color: "var(--text-muted)", fontStyle: "normal" }}>unnamed</em>}</div>
                    <div className="var-list-preview">{valuePreview(v)}</div>
                  </div>
                  <button
                    className="var-list-delete"
                    onClick={(e) => { e.stopPropagation(); setPendingDeleteId(v.id); }}
                    aria-label={`Delete ${v.key || "variable"}`}
                    title="Delete variable"
                    tabIndex={-1}
                  >
                    <Trash2 size={12} />
                  </button>
                  <ChevronRight size={13} className="var-list-chevron" aria-hidden="true" />
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* FAB */}
      <button
        className="fab-add"
        onClick={onAddVar}
        aria-label="Add new variable"
        title="Add new variable"
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
