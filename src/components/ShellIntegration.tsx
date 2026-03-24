import { useState, useEffect } from "react";
import { generateShellHook, getAppDataDir } from "../lib/envFile";
import { Copy, CheckCheck, Terminal } from "lucide-react";

type Platform = "mac" | "windows";

const step: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-start",
  fontSize: "0.8rem",
  lineHeight: 1.6,
  color: "var(--text-primary)",
};

const stepNum: React.CSSProperties = {
  flexShrink: 0,
  width: "20px",
  height: "20px",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.08)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "0.7rem",
  fontWeight: 700,
  marginTop: "2px",
};

const kbd: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 6px",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: "4px",
  fontFamily: "var(--font-mono, monospace)",
  fontSize: "0.75rem",
};

const secondary: React.CSSProperties = {
  color: "var(--text-secondary)",
  fontSize: "0.75rem",
};

function MacInstructions({ rcFile }: { rcFile: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={step}>
        <div style={stepNum}>1</div>
        <div>
          Open <strong>Terminal</strong> — press{" "}
          <span style={kbd}>⌘ Space</span>, type <em>Terminal</em>, hit{" "}
          <span style={kbd}>Return</span>. Or use <strong>iTerm2</strong> if you
          have it.
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>2</div>
        <div>
          Open your shell config file:
          <br />
          <span style={kbd}>nano {rcFile}</span>
          <br />
          <span style={secondary}>
            Use arrow keys to scroll to the bottom of the file.
          </span>
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>3</div>
        <div>
          Copy the snippet above, paste it at the bottom of the file.
          <br />
          <span style={secondary}>
            In nano: <span style={kbd}>⌃ V</span> or right-click → Paste.
          </span>
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>4</div>
        <div>
          Save and exit: <span style={kbd}>⌃ X</span> →{" "}
          <span style={kbd}>Y</span> → <span style={kbd}>Return</span>
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>5</div>
        <div>
          Activate in your current terminal window:
          <br />
          <span style={kbd}>source {rcFile}</span>
          <br />
          <span style={secondary}>
            Or just open a new terminal tab — it loads automatically.
          </span>
        </div>
      </div>
    </div>
  );
}

function WindowsInstructions({ rcFile }: { rcFile: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div
        style={{
          ...secondary,
          padding: "8px 10px",
          background: "rgba(251,191,36,0.08)",
          border: "1px solid rgba(251,191,36,0.2)",
          borderRadius: "6px",
        }}
      >
        This snippet requires <strong>Git Bash</strong> or <strong>WSL</strong>{" "}
        — it does not work in PowerShell or Command Prompt.
      </div>
      <div style={step}>
        <div style={stepNum}>1</div>
        <div>
          <strong>Git Bash:</strong> right-click your Desktop or any folder →{" "}
          <em>Git Bash Here</em>.
          <br />
          <strong>WSL:</strong> press <span style={kbd}>Win</span>, type{" "}
          <em>Ubuntu</em> (or your distro), hit <span style={kbd}>Enter</span>.
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>2</div>
        <div>
          Open your shell config file:
          <br />
          <span style={kbd}>nano {rcFile}</span>
          <br />
          <span style={secondary}>
            If the file doesn't exist yet, nano will create it.
          </span>
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>3</div>
        <div>
          Copy the snippet above, paste it at the bottom.
          <br />
          <span style={secondary}>
            In Git Bash / WSL terminal: right-click → Paste, or{" "}
            <span style={kbd}>Shift Insert</span>.
          </span>
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>4</div>
        <div>
          Save and exit: <span style={kbd}>Ctrl X</span> →{" "}
          <span style={kbd}>Y</span> → <span style={kbd}>Enter</span>
        </div>
      </div>
      <div style={step}>
        <div style={stepNum}>5</div>
        <div>
          Activate:
          <br />
          <span style={kbd}>source {rcFile}</span>
          <br />
          <span style={secondary}>Or open a new Git Bash / WSL window.</span>
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
  }, []);

  async function handleCopy() {
    if (!hookSnippet) return;
    try {
      await navigator.clipboard.writeText(hookSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available in test environments
    }
  }

  const rcFile = shell === "zsh" ? "~/.zshrc" : "~/.bashrc";

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "5px 14px",
    fontSize: "0.78rem",
    fontWeight: active ? 600 : 400,
    background: active ? "rgba(255,255,255,0.1)" : "transparent",
    border: "1px solid",
    borderColor: active ? "rgba(255,255,255,0.2)" : "transparent",
    borderRadius: "6px",
    cursor: "pointer",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
  });

  if (loading) {
    return (
      <div style={{ padding: "16px" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Loading shell hook...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "16px" }}>
        <p style={{ color: "#f87171", fontSize: "0.85rem" }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Terminal size={16} />
        <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
          Shell Integration
        </h3>
      </div>

      {/* Platform tabs */}
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          style={tabStyle(platform === "mac")}
          onClick={() => setPlatform("mac")}
        >
          macOS
        </button>
        <button
          style={tabStyle(platform === "windows")}
          onClick={() => setPlatform("windows")}
        >
          Windows
        </button>
      </div>

      {/* Shell tabs (mac only — Windows Git Bash is always bash) */}
      {platform === "mac" && (
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ ...secondary, marginRight: "4px" }}>Shell:</span>
          <button
            style={tabStyle(shell === "zsh")}
            onClick={() => setShell("zsh")}
          >
            zsh (default)
          </button>
          <button
            style={tabStyle(shell === "bash")}
            onClick={() => setShell("bash")}
          >
            bash
          </button>
        </div>
      )}

      {/* Snippet */}
      <div>
        <div style={{ ...secondary, marginBottom: "6px" }}>
          1. Copy this snippet:
        </div>
        <div style={{ position: "relative" }}>
          <pre
            style={{
              margin: 0,
              padding: "12px",
              background: "rgba(0,0,0,0.3)",
              borderRadius: "8px",
              fontSize: "0.72rem",
              fontFamily: "var(--font-mono, monospace)",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              maxHeight: "180px",
              overflowY: "auto",
              color: "var(--text-primary)",
            }}
          >
            {hookSnippet}
          </pre>
          <button
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy shell hook"}
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              fontSize: "0.72rem",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              cursor: "pointer",
              color: "var(--text-primary)",
            }}
          >
            {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* App data dir */}
      {appDataDir && (
        <div style={{ ...secondary }}>
          Vars stored at:{" "}
          <code
            style={{
              fontFamily: "var(--font-mono, monospace)",
              wordBreak: "break-all",
            }}
          >
            {appDataDir}
          </code>
        </div>
      )}

      {/* Step-by-step instructions */}
      <div>
        <div style={{ ...secondary, marginBottom: "10px" }}>
          2. Paste it into your shell config:
        </div>
        {platform === "mac" ? (
          <MacInstructions rcFile={rcFile} />
        ) : (
          <WindowsInstructions rcFile="~/.bashrc" />
        )}
      </div>
    </div>
  );
}
