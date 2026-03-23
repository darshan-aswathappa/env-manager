import { useState } from "react";
import {
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Plus,
  Save,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
} from "lucide-react";
import type { EnvVar, Project, GitignoreStatus } from "../types";

interface VarDetailProps {
  project: Project;
  selectedVar: EnvVar | null;
  gitignoreStatus: GitignoreStatus;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onUpdateVar: (varId: string, field: keyof EnvVar, value: string | boolean) => void;
  onDeleteVar: (varId: string) => void;
  onToggleReveal: (varId: string) => void;
  onAddVar: () => void;
  onSave: () => void;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      className="icon-btn"
      onClick={handleCopy}
      aria-label={label}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

export default function VarDetail({
  project,
  selectedVar,
  gitignoreStatus,
  saveStatus,
  onUpdateVar,
  onDeleteVar,
  onToggleReveal,
  onAddVar,
  onSave,
}: VarDetailProps) {
  return (
    <div className="detail-panel">
      {/* Header */}
      <div className="detail-header">
        <div className="detail-header-icon">
          <KeyRound size={16} />
        </div>
        <div className="detail-header-info">
          <div className="detail-header-title">{project.name}</div>
          <div className="detail-header-sub">{project.path}/.env</div>
        </div>
        <div className="detail-header-actions">
          {gitignoreStatus === 'listed' && (
            <span className="badge badge-success" title=".env is listed in .gitignore — it won't be committed to git">
              <ShieldCheck size={11} />
              .env in .gitignore
            </span>
          )}
          {gitignoreStatus === 'not_listed' && (
            <span className="badge badge-warning" title=".env is NOT listed in .gitignore — add it to avoid committing secrets">
              <ShieldAlert size={11} />
              .env not in .gitignore
            </span>
          )}
          {gitignoreStatus === 'no_gitignore' && (
            <span className="badge badge-warning" title="No .gitignore found in this project folder — create one to protect your secrets">
              <ShieldOff size={11} />
              No .gitignore
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="detail-body">
        {selectedVar ? (
          <SelectedVarFields
            key={selectedVar.id}
            v={selectedVar}
            projectId={project.id}
            onUpdate={onUpdateVar}
            onDelete={onDeleteVar}
            onToggleReveal={onToggleReveal}
          />
        ) : (
          <NoVarSelected />
        )}
      </div>

      {/* Footer */}
      <div className="detail-footer">
        <button className="detail-add-btn" onClick={onAddVar} aria-label="Add new variable">
          <Plus size={13} />
          Add variable
        </button>

        <div style={{ flex: 1 }} />

        {saveStatus === "saving" && (
          <span className="save-status save-status-saving" role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            Saving…
          </span>
        )}
        {saveStatus === "saved" && (
          <span className="save-status save-status-saved" role="status" aria-live="polite">
            <Check size={12} />
            Saved
          </span>
        )}
        {saveStatus === "error" && (
          <span className="save-status save-status-error" role="alert" aria-live="assertive">
            Save failed — check file permissions
          </span>
        )}

        <button
          className="btn-primary"
          onClick={onSave}
          disabled={saveStatus === "saving"}
          aria-label="Save .env file to disk"
        >
          <Save size={13} />
          Save to disk
        </button>
      </div>
    </div>
  );
}

/* ── Selected var fields ─────────────────────────────────── */
interface SelectedVarFieldsProps {
  v: EnvVar;
  projectId: string;
  onUpdate: (varId: string, field: keyof EnvVar, value: string | boolean) => void;
  onDelete: (varId: string) => void;
  onToggleReveal: (varId: string) => void;
}

function SelectedVarFields({ v, onUpdate, onDelete, onToggleReveal }: SelectedVarFieldsProps) {
  return (
    <div className="var-detail-content">
      {/* KEY field */}
      <div className="detail-field">
        <span className="detail-label">Key</span>
        <div className="detail-value-row">
          <input
            className="detail-input detail-input--key"
            type="text"
            value={v.key}
            placeholder="VARIABLE_NAME"
            onChange={(e) => onUpdate(v.id, "key", e.target.value)}
            spellCheck={false}
            autoComplete="off"
            aria-label="Variable key"
          />
          <CopyButton text={v.key} label="Copy key" />
          <button
            className="icon-btn danger"
            onClick={() => onDelete(v.id)}
            aria-label="Delete variable"
            title="Delete variable"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="detail-divider" />

      {/* VALUE field */}
      <div className="detail-field">
        <span className="detail-label">Value</span>
        <div className="detail-value-row">
          <input
            className={`detail-input detail-input--val${v.revealed ? "" : " detail-input--masked"}`}
            type="text"
            value={v.val}
            placeholder="Enter value"
            onChange={(e) => onUpdate(v.id, "val", e.target.value)}
            spellCheck={false}
            autoComplete="off"
            data-revealed={v.revealed}
            aria-label={`Value for ${v.key || "variable"}`}
          />
          <div className="detail-actions">
            <button
              className="icon-btn"
              onClick={() => onToggleReveal(v.id)}
              aria-label={v.revealed ? "Hide value" : "Reveal value"}
              aria-pressed={v.revealed}
              title={v.revealed ? "Hide" : "Reveal"}
            >
              {v.revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <CopyButton text={v.val} label="Copy value" />
          </div>
        </div>
      </div>

      <div className="detail-divider" />
    </div>
  );
}

/* ── Nothing selected ────────────────────────────────────── */
function NoVarSelected() {
  return (
    <div className="empty-state" style={{ minHeight: 200 }}>
      <div className="empty-state-icon">
        <KeyRound size={24} />
      </div>
      <h2 className="empty-state-title">No variable selected</h2>
      <p className="empty-state-desc">
        Select a variable from the list to view or edit it, or use the button below to add one.
      </p>
    </div>
  );
}
