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
import type { EnvVar, Project, GitignoreStatus, Environment } from "../types";
import { envDisplayName } from "../types";
import EnvironmentToggle from "./EnvironmentToggle";

type ShellIntegrationStatus = 'zsh' | 'bash' | 'both' | 'not_found';

interface VarDetailProps {
  project: Project;
  selectedVar: EnvVar | null;
  gitignoreStatus: GitignoreStatus;
  saveStatus: "idle" | "saving" | "saved" | "error";
  clipboardClearSeconds?: number;
  environments: Environment[];
  activeEnv: string;
  shellStatus: ShellIntegrationStatus;
  onUpdateVar: (varId: string, field: keyof EnvVar, value: string | boolean) => void;
  onDeleteVar: (varId: string) => void;
  onToggleReveal: (varId: string) => void;
  onAddVar: () => void;
  onSave: () => void;
  onSwitchEnvironment: (suffix: string) => void;
  onOpenShellIntegration: () => void;
}

function CopyButton({ text, label, clearAfterSecs = 0 }: { text: string; label: string; clearAfterSecs?: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      if (clearAfterSecs > 0) {
        setTimeout(() => {
          navigator.clipboard.writeText("").catch(() => {});
        }, clearAfterSecs * 1000);
      }
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      className={`icon-btn${copied ? " icon-btn--copied" : ""}`}
      onClick={handleCopy}
      aria-label={label}
      title={copied ? "Copied!" : "Copy"}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function shellLabel(status: ShellIntegrationStatus): string {
  if (status === 'both') return 'zsh + bash';
  return status;
}

export default function VarDetail({
  project,
  selectedVar,
  gitignoreStatus,
  saveStatus,
  clipboardClearSeconds = 0,
  environments,
  activeEnv,
  shellStatus,
  onUpdateVar,
  onDeleteVar,
  onToggleReveal,
  onAddVar,
  onSave,
  onSwitchEnvironment,
  onOpenShellIntegration,
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
          <div className="detail-header-sub">
            {project.path}/<span className={`env-hint env-hint--${activeEnv === 'production' ? 'prod' : activeEnv === 'staging' || activeEnv === 'testing' ? 'warn' : activeEnv === 'development' || activeEnv === 'local' ? 'dev' : 'base'}`}>{envDisplayName(activeEnv)}</span>
          </div>
        </div>
        <EnvironmentToggle
          environments={environments}
          activeEnv={activeEnv}
          envTier={activeEnv === 'production' ? 'prod' : activeEnv === 'staging' || activeEnv === 'testing' ? 'warn' : activeEnv === 'development' || activeEnv === 'local' ? 'dev' : 'base'}
          onSwitch={onSwitchEnvironment}
        />
        <div className="detail-header-actions">
          {gitignoreStatus === 'listed' && (
            <span className="badge badge-success" title=".env is listed in .gitignore — it won't be committed to git">
              <ShieldCheck size={11} />
            </span>
          )}
          {gitignoreStatus === 'not_listed' && (
            <span className="badge badge-warning" title=".env is NOT listed in .gitignore — add it to avoid committing secrets">
              <ShieldAlert size={11} />
            </span>
          )}
          {gitignoreStatus === 'no_gitignore' && (
            <span className="badge badge-warning" title="No .gitignore found in this project folder — create one to protect your secrets">
              <ShieldOff size={11} />
            </span>
          )}
        </div>
      </div>

      {/* Shell injection status */}
      <div className="injection-bar">
        <span className={`injection-bar__dot ${shellStatus !== 'not_found' ? 'injection-bar__dot--active' : 'injection-bar__dot--inactive'}`} />
        {shellStatus !== 'not_found' ? (
          <span>
            <span className="injection-bar__env">{envDisplayName(activeEnv)}</span>
            {' '}loaded via {shellLabel(shellStatus)}
          </span>
        ) : (
          <span>
            Auto-load not configured
            {' · '}
            <button className="injection-bar__link" onClick={onOpenShellIntegration}>Set up</button>
          </span>
        )}
      </div>

      {/* Body */}
      <div className="detail-body">
        {selectedVar ? (
          <SelectedVarFields
            key={selectedVar.id}
            v={selectedVar}
            projectId={project.id}
            clipboardClearSeconds={clipboardClearSeconds}
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
            Couldn't save — check folder write access
          </span>
        )}

        <button
          className="btn-primary"
          onClick={onSave}
          disabled={saveStatus === "saving"}
          aria-label={`Save ${envDisplayName(activeEnv)} file to disk`}
        >
          <Save size={13} />
          Save {envDisplayName(activeEnv)}
        </button>
      </div>
    </div>
  );
}

/* ── Selected var fields ─────────────────────────────────── */
interface SelectedVarFieldsProps {
  v: EnvVar;
  projectId: string;
  clipboardClearSeconds?: number;
  onUpdate: (varId: string, field: keyof EnvVar, value: string | boolean) => void;
  onDelete: (varId: string) => void;
  onToggleReveal: (varId: string) => void;
}

function SelectedVarFields({ v, clipboardClearSeconds = 0, onUpdate, onDelete, onToggleReveal }: SelectedVarFieldsProps) {
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
            onChange={(e) => {
              // Sanitize: only allow valid .env key characters (letters, digits, underscores)
              const sanitized = e.target.value.replace(/[^A-Za-z0-9_]/g, "_");
              onUpdate(v.id, "key", sanitized);
            }}
            spellCheck={false}
            autoComplete="off"
            aria-label="Variable key"
            maxLength={256}
          />
          <CopyButton text={v.key} label="Copy key" clearAfterSecs={clipboardClearSeconds} />
          <button
            className="icon-btn danger"
            onClick={() => onDelete(v.id)}
            aria-label="Delete variable"
            title="Delete variable"
          >
            <Trash2 size={13} />
          </button>
        </div>
        {!v.key.trim() && (
          <span className="detail-warn" role="alert">
            Add a key name — this variable won't be saved without one
          </span>
        )}
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
            <CopyButton text={v.val} label="Copy value" clearAfterSecs={clipboardClearSeconds} />
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
    <div className="empty-state">
      <div className="empty-state-icon">
        <KeyRound size={24} />
      </div>
      <h2 className="empty-state-title">No variable selected</h2>
      <p className="empty-state-desc">
        Choose a variable from the list to edit it, or add a new one below.
      </p>
    </div>
  );
}
