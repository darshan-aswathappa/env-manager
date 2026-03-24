import { Search, ChevronRight, Plus, FolderOpen } from "lucide-react";
import type { EnvVar, Project } from "../types";

interface VarListProps {
  project: Project | null;
  selectedVarId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectVar: (id: string) => void;
  onAddVar: () => void;
}

/** Neutral indicator dot — uniform across all variable types. */
function varDotColor(_key: string): string {
  return "#3a3a3c";
}

/** Always show masked dots in the list — values are only revealed in the detail panel. */
function valuePreview(v: EnvVar): string {
  if (!v.val) return "";
  return "••••••••";
}

export default function VarList({
  project,
  selectedVarId,
  searchQuery,
  onSearchChange,
  onSelectVar,
  onAddVar,
}: VarListProps) {
  if (!project) {
    return (
      <div className="list-panel" style={{ justifyContent: "center", alignItems: "center", display: "flex" }}>
        <div className="list-empty">
          <FolderOpen size={28} className="list-empty-icon" />
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
            <span>No results for "{searchQuery}"</span>
          </div>
        )}

        {filtered.length === 0 && !searchQuery && (
          <div className="list-empty">
            <Plus size={22} className="list-empty-icon" />
            <span>No variables yet.</span>
            <span>Click + to add one.</span>
          </div>
        )}

        {filtered.map((v, index) => (
          <div
            key={v.id}
            className={`var-list-item${selectedVarId === v.id ? " active" : ""}`}
            style={{
              '--item-index': Math.min(index, 8),
            } as React.CSSProperties}
            onClick={() => onSelectVar(v.id)}
            role="listitem"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectVar(v.id);
              }
            }}
            aria-label={v.key || "Unnamed variable"}
            aria-current={selectedVarId === v.id ? "true" : undefined}
          >
            <span
              className="var-list-icon"
              style={{ background: varDotColor(v.key) }}
              aria-hidden="true"
            />
            <div className="var-list-body">
              <div className="var-list-key">{v.key || <em style={{ color: "var(--text-muted)", fontStyle: "normal" }}>unnamed</em>}</div>
              <div className="var-list-preview">{valuePreview(v)}</div>
            </div>
            <ChevronRight size={13} className="var-list-chevron" aria-hidden="true" />
          </div>
        ))}
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
