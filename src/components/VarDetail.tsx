import { useState, useEffect, useRef } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Trash2,
  Save,
  ChevronDown,
  ArrowRightLeft,
  GitCompare,
} from "lucide-react";
import type { EnvVar, Project, GitignoreStatus, Environment, DuplicateReport } from "../types";
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
  onOpenPush?: (() => void) | null;
  onOpenDiff?: (() => void) | null;
  duplicateReport?: DuplicateReport;
  renamePrompt?: {
    oldKey: string;
    newKey: string;
    affectedSuffixes: string[];
  } | null;
  onPropagateRename?: () => void;
  onDismissRename?: () => void;
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
  onOpenPush = null,
  onOpenDiff = null,
  duplicateReport = { hasDuplicates: false, entries: [], affectedIds: new Set() } as DuplicateReport,
  renamePrompt = null,
  onPropagateRename,
  onDismissRename,
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

        {/* Row 1: project name + env badge + promote button */}
        <div className="proj-header__row proj-header__row--primary">
          <h1 className="proj-header__name">{project.name}</h1>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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

            <button
              data-testid="promote-to-env-btn"
              className="promote-btn"
              aria-label="Promote to another environment"
              title="Promote to another environment (⌘⇧P)"
              onClick={() => { if (onOpenPush) onOpenPush(); }}
              disabled={!onOpenPush}
            >
              <ArrowRightLeft size={11} />
              Promote
            </button>

            {typeof onOpenDiff === 'function' && (
              <button
                data-testid="compare-env-btn"
                className="promote-btn"
                aria-label="Compare Environments"
                title="Compare Environments (⌘D)"
                onClick={onOpenDiff}
              >
                <GitCompare size={11} />
                Compare
              </button>
            )}
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
                  {gitignoreStatus === 'not_listed' ? 'not .gitignored' : 'no .gitignore'}
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
        {renamePrompt && !selectedVar && (
          <RenamePropagateBanner
            oldKey={renamePrompt.oldKey}
            newKey={renamePrompt.newKey}
            affectedSuffixes={renamePrompt.affectedSuffixes}
            onPropagate={onPropagateRename ?? (() => {})}
            onDismiss={onDismissRename ?? (() => {})}
          />
        )}
        {selectedVar ? (
          <SelectedVarFields
            key={selectedVar.id}
            v={selectedVar}
            projectId={project.id}
            clipboardClearSeconds={clipboardClearSeconds}
            onUpdate={onUpdateVar}
            onDelete={onDeleteVar}
            onToggleReveal={onToggleReveal}
            renamePrompt={renamePrompt}
            onPropagateRename={onPropagateRename}
            onDismissRename={onDismissRename}
            duplicateReport={duplicateReport}
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
          disabled={saveStatus === "saving" || duplicateReport.hasDuplicates}
          aria-disabled={duplicateReport.hasDuplicates ? "true" : undefined}
          aria-label={`Save ${envDisplayName(activeEnv)} file to disk`}
        >
          <Save size={13} />
          Save {envDisplayName(activeEnv)}
        </button>
      </div>
    </div>
  );
}

/* ── Rename propagate banner ─────────────────────────────── */
interface RenamePropagateBannerProps {
  oldKey: string;
  newKey: string;
  affectedSuffixes: string[];
  onPropagate: () => void;
  onDismiss: () => void;
}

function RenamePropagateBanner({ oldKey, newKey, affectedSuffixes, onPropagate, onDismiss }: RenamePropagateBannerProps) {
  const propagateBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    propagateBtnRef.current?.focus();
  }, []);

  return (
    <div
      className="rename-propagate-banner"
      role="alert"
      aria-live="polite"
      aria-label="Key rename propagation prompt"
      onKeyDown={(e) => { if (e.key === 'Escape') onDismiss(); }}
      tabIndex={-1}
    >
      <span className="rename-propagate-banner__desc">
        ⟳ Rename &ldquo;{oldKey}&rdquo; → &ldquo;{newKey}&rdquo; in {affectedSuffixes.length} other environment{affectedSuffixes.length !== 1 ? 's' : ''}?
      </span>
      <div className="rename-propagate-banner__chips">
        {affectedSuffixes.map(suffix => (
          <span key={suffix} className="env-badge env-badge--chip">
            {suffix ? `.env.${suffix}` : '.env'}
          </span>
        ))}
      </div>
      <div className="rename-propagate-banner__actions">
        <button className="btn-text" onClick={onDismiss} aria-label="Skip propagation">
          Skip
        </button>
        <button
          ref={propagateBtnRef}
          className="btn-primary"
          onClick={onPropagate}
          aria-label="Propagate All"
        >
          Propagate All
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
  renamePrompt?: { oldKey: string; newKey: string; affectedSuffixes: string[] } | null;
  onPropagateRename?: () => void;
  onDismissRename?: () => void;
  duplicateReport?: DuplicateReport;
}

function SelectedVarFields({ v, clipboardClearSeconds = 0, onUpdate, onDelete, onToggleReveal, renamePrompt = null, onPropagateRename, onDismissRename, duplicateReport = { hasDuplicates: false, entries: [], affectedIds: new Set() } as DuplicateReport }: SelectedVarFieldsProps) {
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
        {v.key.trim() && duplicateReport.affectedIds.has(v.id) && (
          <span className="detail-warn detail-warn--dup" data-testid="duplicate-warning" role="alert">
            "{v.key}" already exists in this environment. The last saved value will take effect when the file is read.
          </span>
        )}
      </div>

      {renamePrompt && (
        <RenamePropagateBanner
          oldKey={renamePrompt.oldKey}
          newKey={renamePrompt.newKey}
          affectedSuffixes={renamePrompt.affectedSuffixes}
          onPropagate={onPropagateRename ?? (() => {})}
          onDismiss={onDismissRename ?? (() => {})}
        />
      )}

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

      {/* NOTE field */}
      <div className="detail-field">
        <label htmlFor="var-note" className="detail-label">Note</label>
        <div className="detail-value-row">
          <textarea
            id="var-note"
            className="detail-input detail-input--note"
            value={v.comment ?? ''}
            placeholder="Add a note — purpose, expiry, rotation link…"
            onChange={(e) => onUpdate(v.id, 'comment', e.target.value)}
            rows={1}
            spellCheck={false}
            aria-label="Note"
            maxLength={500}
          />
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
