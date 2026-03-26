import { useState, useEffect } from "react";
import {
  Settings,
  Shield,
  Database,
  AlertTriangle,
  Info,
  Copy,
  Check,
} from "lucide-react";
import { getAppDataDir } from "../lib/envFile";
import type { AppSettings, InheritanceMode } from "../types";

interface SettingsProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onResetOnboarding: () => void;
  onClearAllData: () => void;
}

export default function SettingsPanel({
  settings,
  onChange,
  onResetOnboarding,
  onClearAllData,
}: SettingsProps) {
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [copiedPath, setCopiedPath] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState("");

  useEffect(() => {
    getAppDataDir()
      .then(setAppDataDir)
      .catch(() => {});
  }, []);

  function update(partial: Partial<AppSettings>) {
    onChange({ ...settings, ...partial });
  }

  async function copyPath() {
    if (!appDataDir) return;
    try {
      await navigator.clipboard.writeText(appDataDir);
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  function handleResetOnboarding() {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    onResetOnboarding();
  }

  const canClear = clearInput.trim().toUpperCase() === "RESET";

  return (
    <div className="sett-root">
      {/* Header */}
      <div className="sett-header">
        <Settings size={15} aria-hidden="true" />
        <h3 className="sett-header-title">Settings</h3>
      </div>

{/* ── Inheritance ────────────────────────────────────── */}
      <section className="sett-section">
        <div className="sett-section-label">Inheritance</div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Default mode for new projects</div>
            <div className="sett-row-desc">
              How sub-projects inherit variables from their parent
            </div>
          </div>
          <select
            className="sett-select"
            value={settings.defaultInheritanceMode}
            onChange={(e) =>
              update({
                defaultInheritanceMode: e.target.value as InheritanceMode,
              })
            }
            aria-label="Default inheritance mode"
          >
            <option value="merge-child-wins">Sub-project overrides parent</option>
            <option value="merge-parent-wins">Parent overrides sub-project</option>
            <option value="isolated">Independent (no inheritance)</option>
          </select>
        </div>

        <div className="sett-note">
          When a sub-project and its parent share the same variable name, this
          controls which value takes effect.
          <br />
          <span className="sett-note-item">
            <strong>Sub-project overrides</strong> — sub-project's value wins.
          </span>
          <span className="sett-note-item">
            <strong>Parent overrides</strong> — parent's value wins.
          </span>
          <span className="sett-note-item">
            <strong>Independent</strong> — sub-project only uses its own variables.
          </span>
        </div>
      </section>

      {/* ── Security ───────────────────────────────────────── */}
      <section className="sett-section">
        <div className="sett-section-label">
          <Shield size={10} aria-hidden="true" />
          Security
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Hide values after inactivity</div>
            <div className="sett-row-desc">
              Automatically re-hide revealed values. 0 = off.
            </div>
          </div>
          <div className="sett-number-row">
            <input
              type="number"
              className="sett-number-input"
              min={0}
              max={120}
              value={settings.autoMaskMinutes}
              onChange={(e) =>
                update({
                  autoMaskMinutes: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
              aria-label="Auto-mask timeout in minutes"
            />
            <span className="sett-unit">min</span>
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Clear clipboard after copying</div>
            <div className="sett-row-desc">
              Auto-clear clipboard after copying a secret. 0 = off.
            </div>
          </div>
          <div className="sett-number-row">
            <input
              type="number"
              className="sett-number-input"
              min={0}
              max={300}
              value={settings.clipboardClearSeconds}
              onChange={(e) =>
                update({
                  clipboardClearSeconds: Math.max(
                    0,
                    parseInt(e.target.value) || 0,
                  ),
                })
              }
              aria-label="Clipboard clear delay in seconds"
            />
            <span className="sett-unit">sec</span>
          </div>
        </div>
      </section>

      {/* ── Data ───────────────────────────────────────────── */}
      <section className="sett-section">
        <div className="sett-section-label">
          <Database size={10} aria-hidden="true" />
          Data
        </div>

        <div className="sett-row sett-row--wrap">
          <div className="sett-row-name">App data directory</div>
          <div className="sett-path-row">
            <code className="sett-path">{appDataDir ?? "Loading…"}</code>
            {appDataDir && (
              <button
                className="sett-icon-btn"
                onClick={copyPath}
                aria-label={copiedPath ? "Copied" : "Copy path"}
                title={copiedPath ? "Copied" : "Copy path"}
              >
                {copiedPath ? <Check size={12} /> : <Copy size={12} />}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Danger Zone ────────────────────────────────────── */}
      <section className="sett-section sett-section--danger">
        <div className="sett-section-label">
          <AlertTriangle size={10} aria-hidden="true" />
          Danger Zone
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Reset onboarding</div>
            <div className="sett-row-desc">
              Re-run the setup wizard on next launch
            </div>
          </div>
          <button
            className={`sett-danger-btn${resetConfirm ? " sett-danger-btn--confirm" : ""}`}
            onClick={handleResetOnboarding}
            onBlur={() => setResetConfirm(false)}
          >
            {resetConfirm ? "Click again to confirm" : "Reset"}
          </button>
        </div>

        {!showClearConfirm ? (
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-name">Clear all data</div>
              <div className="sett-row-desc">
                Permanently delete all projects and variables
              </div>
            </div>
            <button
              className="sett-danger-btn"
              onClick={() => setShowClearConfirm(true)}
            >
              Clear all data
            </button>
          </div>
        ) : (
          <div className="sett-clear-confirm">
            <div className="sett-row-desc">
              Type{" "}
              <strong style={{ color: "var(--color-danger)" }}>RESET</strong> to
              permanently delete all projects and variables:
            </div>
            <div className="sett-clear-row">
              <input
                type="text"
                className="sett-clear-input"
                value={clearInput}
                onChange={(e) => setClearInput(e.target.value)}
                placeholder="RESET"
                autoFocus
                spellCheck={false}
                aria-label="Type RESET to confirm"
              />
              <button
                className="sett-danger-btn sett-danger-btn--confirm"
                onClick={onClearAllData}
                disabled={!canClear}
              >
                Delete everything
              </button>
              <button
                className="sett-link-btn"
                onClick={() => {
                  setShowClearConfirm(false);
                  setClearInput("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── About ──────────────────────────────────────────── */}
      <section className="sett-section sett-section--about">
        <div className="sett-section-label">
          <Info size={10} aria-hidden="true" />
          About
        </div>
        <div className="sett-about-row">
          <span className="sett-about-name">.envVault</span>
          <span className="sett-about-version">v1.2.0</span>
        </div>
      </section>
    </div>
  );
}
