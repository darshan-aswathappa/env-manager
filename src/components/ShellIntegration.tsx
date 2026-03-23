import { useState, useEffect } from "react";
import { generateShellHook, getAppDataDir } from "../lib/envFile";
import { Copy, CheckCheck, Terminal } from "lucide-react";

export default function ShellIntegration() {
  const [hookSnippet, setHookSnippet] = useState<string | null>(null);
  const [appDataDir, setAppDataDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
          setError(err instanceof Error ? err.message : "Unable to generate shell hook");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
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

  if (loading) {
    return (
      <div className="shell-integration">
        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
          Loading shell hook...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="shell-integration">
        <p style={{ color: "var(--color-error, #f87171)", fontSize: "0.85rem" }}>
          Error: {error} — Unable to generate shell hook.
        </p>
      </div>
    );
  }

  return (
    <div className="shell-integration" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Terminal size={16} />
        <h3 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 600 }}>Shell Integration</h3>
      </div>

      <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        Paste this snippet into your <code>~/.zshrc</code> or <code>~/.bashrc</code> to automatically
        load environment variables when you <code>cd</code> into a project folder.
      </p>

      {appDataDir && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
          App data directory: <code style={{ fontFamily: "var(--font-mono, monospace)" }}>{appDataDir}</code>
        </div>
      )}

      <div style={{ position: "relative" }}>
        <pre
          style={{
            margin: 0,
            padding: "12px",
            background: "var(--bg-secondary, rgba(0,0,0,0.2))",
            borderRadius: "8px",
            fontSize: "0.72rem",
            fontFamily: "var(--font-mono, monospace)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            maxHeight: "300px",
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
            background: "var(--bg-primary, rgba(255,255,255,0.1))",
            border: "1px solid var(--border-color, rgba(255,255,255,0.15))",
            borderRadius: "6px",
            cursor: "pointer",
            color: "var(--text-primary)",
          }}
        >
          {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
        After pasting, run <code>source ~/.zshrc</code> (or restart your terminal) to activate.
      </p>
    </div>
  );
}
