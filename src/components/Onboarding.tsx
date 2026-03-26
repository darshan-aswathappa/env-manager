import { useState, useRef, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  FolderTree,
  Terminal as TerminalIcon,
  ShieldCheck,
} from "lucide-react";
import ShellIntegration from "./ShellIntegration";
import { checkShellIntegration } from "../lib/envFile";
import logo from "../assets/logo.png";

type Step = "welcome" | "install" | "verify";
type VerifyStatus = "idle" | "checking" | "found" | "not_found";

const STEPS: Step[] = ["welcome", "install", "verify"];
const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  install: "Install",
  verify: "Verify",
};

const SHELL_LABEL: Record<string, string> = {
  zsh: "zsh",
  bash: "bash",
  both: "zsh and bash",
};

const FEATURES = [
  {
    icon: FolderTree,
    text: "Manage variables across multiple projects and sub-projects",
  },
  {
    icon: TerminalIcon,
    text: (
      <>
        Shell hook auto-loads vars when you{" "}
        <code className="ob-code">cd</code> into a directory
      </>
    ),
  },
  {
    icon: ShieldCheck,
    text: "Values stay local — nothing leaves your machine",
  },
] as const;

// Animation timing (ms)
const SWAP_MS = 160;
const CLEANUP_MS = 400;

interface OnboardingProps {
  onComplete: () => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [renderedStep, setRenderedStep] = useState<Step>("welcome");
  const [stepIdx, setStepIdx] = useState(0);
  const [animClass, setAnimClass] = useState("ob-step--enter-fwd");
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>("idle");
  const [foundShell, setFoundShell] = useState<string | null>(null);

  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (swapTimer.current) clearTimeout(swapTimer.current);
      if (cleanTimer.current) clearTimeout(cleanTimer.current);
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        if (renderedStep === "welcome") navigateTo("install");
        else if (renderedStep === "install") navigateTo("verify");
        else if (renderedStep === "verify" && verifyStatus === "idle") handleVerify();
        else if (renderedStep === "verify" && verifyStatus === "found") handleComplete();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [renderedStep, verifyStatus]);

  function navigateTo(nextStep: Step) {
    const currentIdx = STEPS.indexOf(renderedStep);
    const nextIdx = STEPS.indexOf(nextStep);
    const forward = nextIdx > currentIdx;

    if (swapTimer.current) clearTimeout(swapTimer.current);
    if (cleanTimer.current) clearTimeout(cleanTimer.current);

    const sizer = sizerRef.current;
    if (sizer) {
      sizer.style.height = `${sizer.scrollHeight}px`;
    }

    setAnimClass(forward ? "ob-step--exit-fwd" : "ob-step--exit-bwd");

    swapTimer.current = setTimeout(() => {
      setRenderedStep(nextStep);
      setStepIdx(nextIdx);
      setAnimClass(forward ? "ob-step--enter-fwd" : "ob-step--enter-bwd");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (sizer) {
            const prevHeight = parseFloat(sizer.style.height);
            sizer.style.height = "auto";
            const newHeight = sizer.scrollHeight;
            sizer.style.height = `${prevHeight}px`;
            void sizer.offsetHeight;
            sizer.style.height = `${newHeight}px`;
          }
        });
      });

      cleanTimer.current = setTimeout(() => {
        setAnimClass("");
        if (sizer) sizer.style.height = "auto";
      }, CLEANUP_MS - SWAP_MS);
    }, SWAP_MS);
  }

  async function handleVerify() {
    if (verifyStatus === "checking") return;
    setVerifyStatus("checking");
    try {
      const result = await checkShellIntegration();
      if (result === "not_found") {
        setVerifyStatus("not_found");
      } else {
        setFoundShell(result);
        setVerifyStatus("found");
      }
    } catch {
      setVerifyStatus("not_found");
    }
  }

  function handleComplete() {
    localStorage.setItem("dotenv_mgr_onboarding", "complete");
    onComplete();
  }

  return (
    <div className="ob-root">
      <div className="ob-card">
        {/* Step indicator with labels */}
        <div className="ob-stepper" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <div key={s} className="ob-stepper-track">
              <div className="ob-stepper-node">
                <div
                  className={`ob-stepper-dot${i <= stepIdx ? " ob-stepper-dot--active" : ""}`}
                  aria-current={s === renderedStep ? "step" : undefined}
                />
                <span
                  className={`ob-stepper-label${i <= stepIdx ? " ob-stepper-label--active" : ""}`}
                >
                  {STEP_LABELS[s]}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`ob-stepper-line${i < stepIdx ? " ob-stepper-line--active" : ""}`}
                />
              )}
            </div>
          ))}
        </div>

        {/* ── Step content ──────────────────────────────── */}
        <div className="ob-step-sizer" ref={sizerRef}>
          <div className={`ob-step${animClass ? ` ${animClass}` : ""}`}>
            {/* Step 1: Welcome */}
            {renderedStep === "welcome" && (
              <>
                <div className="ob-step-icon">
                  <img src={logo} alt=".envVault" className="ob-logo-img" />
                </div>
                <h1 className="ob-title">Welcome to .envVault</h1>
                <p className="ob-subtitle">
                  A local environment variable manager for developers.
                  Keep your <code className="ob-code">.env</code> files
                  organized, inheritable, and automatically loaded.
                </p>
                <div className="ob-feature-list">
                  {FEATURES.map((f, i) => (
                    <div
                      key={i}
                      className="ob-feature"
                      style={{ "--feat-i": i } as React.CSSProperties}
                    >
                      <span className="ob-feature-icon">
                        <f.icon size={14} aria-hidden="true" />
                      </span>
                      <span>{f.text}</span>
                    </div>
                  ))}
                </div>
                <div className="ob-actions">
                  <button
                    className="ob-btn-primary"
                    onClick={() => navigateTo("install")}
                  >
                    Get Started
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                  <kbd className="ob-kbd-hint">press Enter</kbd>
                </div>
              </>
            )}

            {/* Step 2: Install Hook */}
            {renderedStep === "install" && (
              <>
                <button
                  className="ob-btn-back"
                  onClick={() => navigateTo("welcome")}
                >
                  <ArrowLeft size={13} aria-hidden="true" />
                  Back
                </button>
                <h1 className="ob-title">Set up shell integration</h1>
                <p className="ob-subtitle">
                  Add this hook to your shell config so environment
                  variables load automatically when you{" "}
                  <code className="ob-code">cd</code> into a project.
                </p>
                <div className="ob-shell-embed">
                  <ShellIntegration />
                </div>
                <div className="ob-actions">
                  <button
                    className="ob-btn-primary"
                    onClick={() => navigateTo("verify")}
                  >
                    I've added the snippet
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                  <kbd className="ob-kbd-hint">Enter</kbd>
                </div>
              </>
            )}

            {/* Step 3: Verify */}
            {renderedStep === "verify" && (
              <>
                <button
                  className="ob-btn-back"
                  onClick={() => navigateTo("install")}
                >
                  <ArrowLeft size={13} aria-hidden="true" />
                  Back
                </button>
                <h1 className="ob-title">Verify your setup</h1>
                <p className="ob-subtitle">
                  Confirm the shell hook is detected before continuing.
                </p>

                <div className="ob-verify-area">
                  {verifyStatus === "idle" && (
                    <div className="ob-verify-idle">
                      <button className="ob-btn-check" onClick={handleVerify}>
                        Check integration
                      </button>
                      <kbd className="ob-kbd-hint">Enter</kbd>
                    </div>
                  )}

                  {verifyStatus === "checking" && (
                    <div className="ob-verify-status ob-verify-status--checking">
                      <Loader2
                        size={16}
                        className="ob-spin"
                        aria-hidden="true"
                      />
                      Checking shell config...
                    </div>
                  )}

                  {verifyStatus === "found" && (
                    <div className="ob-verify-status ob-verify-status--found">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Hook detected in{" "}
                      <strong>
                        {foundShell
                          ? (SHELL_LABEL[foundShell] ?? foundShell)
                          : "your shell"}
                      </strong>
                    </div>
                  )}

                  {verifyStatus === "not_found" && (
                    <div className="ob-verify-not-found">
                      <div className="ob-verify-status ob-verify-status--not-found">
                        <XCircle size={16} aria-hidden="true" />
                        Hook not detected
                      </div>
                      <p className="ob-verify-hint">
                        Paste the snippet into{" "}
                        <code className="ob-code">~/.zshrc</code> or{" "}
                        <code className="ob-code">~/.bashrc</code>, save the
                        file, then check again.
                      </p>
                      <div className="ob-verify-retry-row">
                        <button className="ob-btn-check" onClick={handleVerify}>
                          Check again
                        </button>
                        <button
                          className="ob-btn-ghost"
                          onClick={() => navigateTo("install")}
                        >
                          Back to instructions
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {verifyStatus === "found" && (
                  <div className="ob-actions">
                    <button className="ob-btn-primary ob-btn-primary--enter" onClick={handleComplete}>
                      Enter .envVault
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                    <kbd className="ob-kbd-hint">Enter</kbd>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
