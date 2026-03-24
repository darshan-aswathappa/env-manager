import { useState, useEffect } from "react";
import {
  Settings,
  Terminal,
  Shield,
  Database,
  AlertTriangle,
  Info,
  Copy,
  Check,
} from "lucide-react";
import { getAppDataDir, checkShellIntegration } from "../lib/envFile";
import type { AppSettings, InheritanceMode } from "../types";

interface SettingsProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onResetOnboarding: () => void;
  onClearAllData: () => void;
  onOpenShellIntegration: () => void;
}

export default function SettingsPanel({
  settings,
  onChange,
  onResetOnboarding,
  onClearAllData,
  onOpenShellIntegration,
}: SettingsProps) {
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [shellStatus, setShellStatus] = useState<string>("Checking…");
  const [copiedPath, setCopiedPath] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInput, setClearInput] = useState("");

  useEffect(() => {
    getAppDataDir()
      .then(setAppDataDir)
      .catch(() => {});
    checkShellIntegration()
      .then((status) => {
        if (status === "not_found") setShellStatus("Not installed");
        else if (status === "zsh") setShellStatus("Installed — zsh");
        else if (status === "bash") setShellStatus("Installed — bash");
        else if (status === "both") setShellStatus("Installed — zsh + bash");
      })
      .catch(() => setShellStatus("Unknown"));
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

      {/* ── Shell ──────────────────────────────────────────── */}
      {/* <section className="sett-section">
        <div className="sett-section-label">
          <Terminal size={10} aria-hidden="true" />
          Shell
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Default shell</div>
            <div className="sett-row-desc">Used when generating the hook snippet</div>
          </div>
          <div className="sett-pill-group" role="group" aria-label="Default shell">
            <button
              className={`sett-pill${settings.defaultShell === "zsh" ? " active" : ""}`}
              onClick={() => update({ defaultShell: "zsh" })}
              aria-pressed={settings.defaultShell === "zsh"}
            >
              zsh
            </button>
            <button
              className={`sett-pill${settings.defaultShell === "bash" ? " active" : ""}`}
              onClick={() => update({ defaultShell: "bash" })}
              aria-pressed={settings.defaultShell === "bash"}
            >
              bash
            </button>
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Hook status</div>
            <div className="sett-row-desc">{shellStatus}</div>
          </div>
          <button className="sett-link-btn" onClick={onOpenShellIntegration}>
            Manage →
          </button>
        </div>
      </section> */}

      {/* ── Inheritance ────────────────────────────────────── */}
      <section className="sett-section">
        <div className="sett-section-label">Inheritance</div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-name">Default mode for new projects</div>
            <div className="sett-row-desc">
              How child projects resolve vars from their parent
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
            <option value="merge-child-wins">Merge — child wins</option>
            <option value="merge-parent-wins">Merge — parent wins</option>
            <option value="isolated">Isolated</option>
          </select>
        </div>

        <div className="sett-note">
          When a child project shares a variable name with its parent, this
          controls whose value wins.
          <br />
          <span className="sett-note-item">
            <strong>Child wins</strong> — child overrides parent.
          </span>
          <span className="sett-note-item">
            <strong>Parent wins</strong> — parent overrides child.
          </span>
          <span className="sett-note-item">
            <strong>Isolated</strong> — parent is ignored entirely.
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
            <div className="sett-row-name">Auto-mask after inactivity</div>
            <div className="sett-row-desc">
              Re-hide revealed values after N minutes. 0 = never.
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
            <div className="sett-row-name">Clipboard clear delay</div>
            <div className="sett-row-desc">
              Clear clipboard after copying a value. 0 = never.
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
          <span className="sett-about-version">v1.0.0</span>
        </div>
      </section>
    </div>
  );
}
