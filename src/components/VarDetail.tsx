import { useState } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Save,
  ChevronDown,
} from "lucide-react";
import type { EnvVar, Project, GitignoreStatus, Environment } from "../types";
import { envDisplayName } from "../types";
import type { ShellIntegrationStatus } from "../lib/envFile";

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
  onSave,
  onSwitchEnvironment,
  onOpenShellIntegration,
}: VarDetailProps) {
  const envTier = activeEnv === 'production'
    ? 'prod'
    : (activeEnv === 'staging' || activeEnv === 'testing')
      ? 'warn'
      : (activeEnv === 'development' || activeEnv === 'local')
        ? 'dev'
        : 'base';

  return (
    <div className="detail-panel">
      {/* Unified 2-row header */}
      <header className="proj-header" aria-label={`${project.name} — ${envDisplayName(activeEnv)}`}>

        {/* Row 1: project name + env badge */}
        <div className="proj-header__row proj-header__row--primary">
          <h1 className="proj-header__name">{project.name}</h1>

          <div className="env-badge-wrap" data-env-tier={envTier}>
            <span className="env-badge" aria-hidden="true">
              <span className="env-badge__dot" />
              <span className="env-badge__label">{envDisplayName(activeEnv)}</span>
              <span className="env-badge__chevron"><ChevronDown size={9} /></span>
            </span>
            <select
              className="env-badge__select"
              value={activeEnv}
              onChange={(e) => { if (e.target.value !== activeEnv) onSwitchEnvironment(e.target.value); }}
              aria-label="Switch environment"
            >
              {environments.map((env) => (
                <option key={env.suffix} value={env.suffix}>
                  {envDisplayName(env.suffix)}{env.vars.length > 0 ? ` (${env.vars.length})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: path + security signals */}
        <div className="proj-header__row proj-header__row--secondary">
          <span className="proj-header__path" title={`${project.path}/${envDisplayName(activeEnv)}`}>
            {project.path}/{envDisplayName(activeEnv)}
          </span>

          <div className="proj-header__signals">
            {gitignoreStatus === 'listed' ? (
              <span
                className="header-signal header-signal--ok"
                title=".env is listed in .gitignore"
                aria-label=".gitignore protected"
              >
                <span className="header-signal__dot" />
                <span className="header-signal__text">.gitignore</span>
              </span>
            ) : (
              <span
                className="header-signal header-signal--warn"
                title={gitignoreStatus === 'not_listed'
                  ? '.env is NOT listed in .gitignore — secrets may be committed'
                  : 'No .gitignore found in this project'}
                aria-label={gitignoreStatus === 'not_listed' ? '.gitignore missing entry' : 'No .gitignore'}
              >
                <span className="header-signal__dot" />
                <span className="header-signal__text">
                  {gitignoreStatus === 'not_listed' ? '!.gitignore' : 'no .gitignore'}
                </span>
              </span>
            )}

            <span className="header-signal-sep" aria-hidden="true" />

            <button
              className={`header-signal header-signal--shell${shellStatus !== 'not_found' ? ' header-signal--ok' : ' header-signal--inactive'}`}
              onClick={onOpenShellIntegration}
              title={shellStatus !== 'not_found'
                ? `Auto-load active via ${shellLabel(shellStatus)}`
                : 'Auto-load not configured — click to set up'}
              aria-label={shellStatus !== 'not_found'
                ? `Shell integration active: ${shellLabel(shellStatus)}`
                : 'Shell integration not configured'}
            >
              <span className="header-signal__dot" />
              <span className="header-signal__text">
                {shellStatus !== 'not_found' ? shellLabel(shellStatus) : 'shell'}
              </span>
            </button>
          </div>
        </div>

      </header>

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
      <h2 className="empty-state-title">No variable selected</h2>
      <p className="empty-state-desc">
        Pick a variable from the list to edit it, or use + to create one.
      </p>
    </div>
  );
}
