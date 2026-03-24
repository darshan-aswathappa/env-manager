import { useState, useEffect } from "react";
import { generateShellHook, getAppDataDir } from "../lib/envFile";
import { Copy, CheckCheck, Terminal } from "lucide-react";

type Platform = "mac" | "windows";

function MacInstructions({ rcFile, shell }: { rcFile: string; shell: "zsh" | "bash" }) {
  return (
    <div className="si-steps">
      <div className="si-step">
        <div className="si-step-num">1</div>
        <div className="si-step-content">
          Open <strong>Terminal</strong> — press{" "}
          <kbd className="si-kbd">⌘ Space</kbd>, type <em>Terminal</em>, hit{" "}
          <kbd className="si-kbd">Return</kbd>. Or use <strong>iTerm2</strong> if you
          have it.
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">2</div>
        <div className="si-step-content">
          Open your shell config file:
          <br />
          <kbd className="si-kbd">nano {rcFile}</kbd>
          <br />
          <span className="si-secondary">
            Use arrow keys to scroll to the bottom of the file.
          </span>
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">3</div>
        <div className="si-step-content">
          Copy the snippet from step 1, paste it at the bottom of the file.
          <br />
          <span className="si-secondary">
            In nano: <kbd className="si-kbd">⌃ V</kbd> or right-click → Paste.
          </span>
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">4</div>
        <div className="si-step-content">
          Save and exit: <kbd className="si-kbd">⌃ X</kbd> →{" "}
          <kbd className="si-kbd">Y</kbd> → <kbd className="si-kbd">Return</kbd>
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">5</div>
        <div className="si-step-content">
          Activate in your current terminal window:
          <br />
          <kbd className="si-kbd">source {rcFile}</kbd>
          <br />
          <span className="si-secondary">
            {shell === "zsh"
              ? "Or just open a new terminal tab — it loads automatically."
              : "Then open a new terminal tab to confirm it loads automatically."}
          </span>
        </div>
      </div>
      {shell === "bash" && (
        <div className="si-note">
          <strong>bash note:</strong> New terminal tabs source{" "}
          <code>~/.bash_profile</code>, not <code>~/.bashrc</code>. Make sure{" "}
          <code>~/.bash_profile</code> contains:
          <br />
          <kbd className="si-kbd">{"[ -f ~/.bashrc ] && source ~/.bashrc"}</kbd>
        </div>
      )}
    </div>
  );
}

function WindowsInstructions({ rcFile }: { rcFile: string }) {
  return (
    <div className="si-steps">
      <div className="si-note">
        This snippet requires <strong>Git Bash</strong> or <strong>WSL</strong>{" "}
        — it does not work in PowerShell or Command Prompt.
      </div>
      <div className="si-step">
        <div className="si-step-num">1</div>
        <div className="si-step-content">
          <strong>Git Bash:</strong> right-click your Desktop or any folder →{" "}
          <em>Git Bash Here</em>.
          <br />
          <strong>WSL:</strong> press <kbd className="si-kbd">Win</kbd>, type{" "}
          <em>Ubuntu</em> (or your distro), hit <kbd className="si-kbd">Enter</kbd>.
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">2</div>
        <div className="si-step-content">
          Open your shell config file:
          <br />
          <kbd className="si-kbd">nano {rcFile}</kbd>
          <br />
          <span className="si-secondary">
            If the file doesn't exist yet, nano will create it.
          </span>
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">3</div>
        <div className="si-step-content">
          Copy the snippet above, paste it at the bottom.
          <br />
          <span className="si-secondary">
            In Git Bash / WSL terminal: right-click → Paste, or{" "}
            <kbd className="si-kbd">Shift Insert</kbd>.
          </span>
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">4</div>
        <div className="si-step-content">
          Save and exit: <kbd className="si-kbd">Ctrl X</kbd> →{" "}
          <kbd className="si-kbd">Y</kbd> → <kbd className="si-kbd">Enter</kbd>
        </div>
      </div>
      <div className="si-step">
        <div className="si-step-num">5</div>
        <div className="si-step-content">
          Activate in your current terminal window:
          <br />
          <kbd className="si-kbd">source {rcFile}</kbd>
          <br />
          <span className="si-secondary">Or open a new Git Bash / WSL window.</span>
        </div>
      </div>
    </div>
  );
}

export default function ShellIntegration() {
  const [hookSnippet, setHookSnippet] = useState<string | null>(null);
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [platform, setPlatform] = useState<Platform>("mac");
  const [shell, setShell] = useState<"zsh" | "bash">("zsh");

  useEffect(() => {
    // Best-effort platform detection
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("windows")) setPlatform("windows");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [hook, dir] = await Promise.all([
          generateShellHook(),
          getAppDataDir(),
        ]);
        if (!cancelled) {
          setHookSnippet(hook);
          setAppDataDir(dir);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Unable to generate shell hook",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [loadKey]);

  function handleRetry() {
    setError(null);
    setLoading(true);
    setLoadKey((k) => k + 1);
  }

  async function handleCopy() {
    if (!hookSnippet) return;
    try {
      await navigator.clipboard.writeText(hookSnippet);
      setCopied(true);
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  }

  const rcFile = shell === "zsh" ? "~/.zshrc" : "~/.bashrc";

  if (loading) {
    return <div className="si-state">Loading shell hook...</div>;
  }

  if (error) {
    return (
      <div className="si-state si-state--error">
        <div>Error: {error}</div>
        <button className="si-retry-btn" onClick={handleRetry}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="si-root">
      {/* Header */}
      <div className="si-header">
        <Terminal size={16} aria-hidden="true" />
        <h3 className="si-header-title">Shell Integration</h3>
      </div>

      {/* Platform tabs */}
      <div className="si-tabs" role="tablist" aria-label="Platform">
        <button
          role="tab"
          aria-selected={platform === "mac"}
          className={`si-tab${platform === "mac" ? " active" : ""}`}
          onClick={() => setPlatform("mac")}
        >
          macOS
        </button>
        <button
          role="tab"
          aria-selected={platform === "windows"}
          className={`si-tab${platform === "windows" ? " active" : ""}`}
          onClick={() => setPlatform("windows")}
        >
          Windows
        </button>
      </div>

      {/* Shell tabs (mac only — Windows Git Bash is always bash) */}
      {platform === "mac" && (
        <div className="si-shell-tabs" role="tablist" aria-label="Shell">
          <span className="si-shell-label">Shell:</span>
          <button
            role="tab"
            aria-selected={shell === "zsh"}
            className={`si-tab${shell === "zsh" ? " active" : ""}`}
            onClick={() => setShell("zsh")}
          >
            zsh (default)
          </button>
          <button
            role="tab"
            aria-selected={shell === "bash"}
            className={`si-tab${shell === "bash" ? " active" : ""}`}
            onClick={() => setShell("bash")}
          >
            bash
          </button>
        </div>
      )}

      {/* Snippet */}
      {hookSnippet ? (
        <div>
          <div className="si-section-label">1. Copy this snippet:</div>
          <div className="si-code-block">
            <pre className="si-code-pre">{hookSnippet}</pre>
            <button
              onClick={handleCopy}
              className="si-copy-btn"
              aria-label={copied ? "Copied" : "Copy shell hook"}
            >
              {copied ? (
                <CheckCheck size={12} aria-hidden="true" />
              ) : (
                <Copy size={12} aria-hidden="true" />
              )}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {copyFailed && (
            <div className="si-copy-error" role="alert">
              Copy failed — select and copy manually.
            </div>
          )}
        </div>
      ) : (
        <div className="si-state">Couldn't generate the shell hook. Try restarting the app.</div>
      )}

      {/* App data dir */}
      {appDataDir && (
        <div className="si-storage">
          Variables stored at: <code>{appDataDir}</code>
        </div>
      )}

      {/* Step-by-step instructions */}
      <div>
        <div className="si-section-label">2. Paste it into your shell config:</div>
        {platform === "mac" ? (
          <MacInstructions rcFile={rcFile} shell={shell} />
        ) : (
          <WindowsInstructions rcFile="~/.bashrc" />
        )}
      </div>
    </div>
  );
}
