import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import type { Project, EnvVar, EnvExampleFile, ExampleImportStep } from '../../types'
import { ENV_SUFFIXES, envDisplayName } from '../../types'
import { buildExampleImportPlan, applyExampleImport } from '../../lib/envFormats'

interface EnvExamplePromptDialogProps {
  project: Project
  exampleFile: EnvExampleFile
  onImportComplete: (targetSuffix: string, mergedVars: EnvVar[]) => void
  onDismiss: (projectId: string) => void
  onClose: () => void
}

export default function EnvExamplePromptDialog({
  project,
  exampleFile,
  onImportComplete,
  onDismiss,
  onClose,
}: EnvExamplePromptDialogProps) {
  const [step, setStep] = useState<ExampleImportStep>('prompt')
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [targetSuffix, setTargetSuffix] = useState(project.activeEnv)
  const [revealValues, setRevealValues] = useState(false)
  const [importedCount, setImportedCount] = useState(0)

  // Auto-dismiss 'done' step after 1200ms
  useEffect(() => {
    if (step === 'done') {
      const timer = setTimeout(() => onClose(), 1200)
      return () => clearTimeout(timer)
    }
  }, [step, onClose])

  const currentTargetVars: EnvVar[] = useMemo(
    () => project.environments.find(e => e.suffix === targetSuffix)?.vars ?? [],
    [project.environments, targetSuffix]
  )

  const plan = useMemo(
    () => buildExampleImportPlan(exampleFile, currentTargetVars),
    [exampleFile, currentTargetVars]
  )

  function handleSkip() {
    if (dontAskAgain) onDismiss(project.id)
    onClose()
  }

  function handleImport() {
    const mergedVars = applyExampleImport(plan, currentTargetVars, new Map(), project.id)
    setImportedCount(plan.newCount)
    onImportComplete(targetSuffix, mergedVars)
    setStep('done')
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.45)',
  }

  const dialogStyle: React.CSSProperties = {
    width: 560,
    maxHeight: 520,
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    animation: 'exampleDialogIn 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
    overflow: 'hidden',
  }

  // ── Prompt Step ────────────────────────────────────────────────────────
  if (step === 'prompt') {
    return (
      <div
        style={overlayStyle}
        onClick={onClose}
        data-testid="example-prompt-overlay"
      >
        <div
          style={dialogStyle}
          role="dialog"
          aria-modal="true"
          aria-label=".env.example detected"
          onClick={e => e.stopPropagation()}
          data-testid="example-prompt-dialog"
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 0',
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              .env.example detected
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                padding: '2px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '14px 20px 0', flex: 1 }}>
            <p style={{
              margin: '0 0 8px',
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
            }}>
              This project includes a .env.example file with{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {exampleFile.totalKeyCount} keys
              </strong>.
            </p>
            <p style={{
              margin: '0 0 8px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: 'var(--text-tertiary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              direction: 'rtl',
              textAlign: 'left',
            }}>
              {project.path}/.env.example
            </p>
            {plan.existsCount > 0 && (
              <p style={{
                margin: '0 0 8px',
                fontSize: '0.75rem',
                color: 'var(--text-tertiary)',
              }}>
                {plan.newCount} of {exampleFile.totalKeyCount} keys are new
              </p>
            )}
          </div>

          {/* Checkbox */}
          <div style={{
            padding: '12px 20px 0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <input
              type="checkbox"
              id="dont-ask-again"
              checked={dontAskAgain}
              onChange={e => setDontAskAgain(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <label
              htmlFor="dont-ask-again"
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              Don't ask again for this project
            </label>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '16px 20px',
          }}>
            <button
              onClick={handleSkip}
              aria-label="Skip"
              style={{
                background: 'none',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
            <button
              onClick={() => setStep('preview')}
              disabled={plan.newCount === 0}
              aria-label="Use as Template"
              style={{
                background: plan.newCount === 0 ? 'var(--bg-hover)' : 'var(--color-accent)',
                border: 'none',
                color: plan.newCount === 0 ? 'var(--text-tertiary)' : '#fff',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: '0.8125rem',
                cursor: plan.newCount === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Use as Template
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Preview Step ───────────────────────────────────────────────────────
  if (step === 'preview') {
    type RowItem =
      | { type: 'heading'; text: string }
      | { type: 'row'; row: typeof plan.rows[0] }

    const renderedItems: RowItem[] = []
    let lastHeading: string | null = '__init__'

    for (const row of plan.rows) {
      if (row.sectionHeading !== null && row.sectionHeading !== lastHeading) {
        renderedItems.push({ type: 'heading', text: row.sectionHeading })
        lastHeading = row.sectionHeading
      }
      renderedItems.push({ type: 'row', row })
    }

    return (
      <div
        style={overlayStyle}
        onClick={onClose}
        data-testid="example-preview-overlay"
      >
        <div
          style={dialogStyle}
          role="dialog"
          aria-modal="true"
          aria-label="Import as template"
          onClick={e => e.stopPropagation()}
          data-testid="example-preview-dialog"
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 0',
          }}>
            <h2 style={{
              margin: 0,
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
            }}>
              Import as template
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                padding: '2px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Controls row */}
          <div style={{
            padding: '12px 20px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Target:
              </label>
              <select
                value={targetSuffix}
                onChange={e => setTargetSuffix(e.target.value)}
                aria-label="Target environment"
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  borderRadius: 4,
                  padding: '3px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {ENV_SUFFIXES.map(s => (
                  <option key={s} value={s}>{envDisplayName(s)}</option>
                ))}
              </select>
            </div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={revealValues}
                onChange={e => setRevealValues(e.target.checked)}
              />
              Reveal values
            </label>
          </div>

          {plan.existsCount > 0 && (
            <p style={{
              margin: '8px 20px 0',
              fontSize: '0.75rem',
              color: 'var(--text-tertiary)',
            }}>
              {plan.existsCount} keys already set — shown but not imported
            </p>
          )}

          {/* Key list */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 20px',
            maxHeight: 280,
          }}>
            {plan.newCount === 0 && plan.existsCount > 0 && (
              <div style={{
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: '0.8125rem',
                padding: '24px 0',
              }}>
                Nothing new to import — all keys already set.
              </div>
            )}
            {renderedItems.map((item, i) => {
              if (item.type === 'heading') {
                return (
                  <div
                    key={`heading-${i}`}
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      color: 'var(--text-tertiary)',
                      textTransform: 'uppercase',
                      padding: '8px 0 4px',
                      borderBottom: '1px solid var(--border-subtle)',
                      marginBottom: 4,
                    }}
                  >
                    {item.text}
                  </div>
                )
              }

              const { row } = item
              const isExists = row.status === 'exists'

              let valueDisplay: string
              if (row.placeholder === '') {
                valueDisplay = '—'
              } else if (revealValues) {
                valueDisplay = row.placeholder
              } else {
                valueDisplay = '••••••'
              }

              return (
                <div
                  key={`${row.key}-${i}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '5px 0',
                    opacity: isExists ? 0.5 : 1,
                  }}
                  aria-disabled={isExists ? 'true' : undefined}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '0.8125rem',
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {row.key}
                    </div>
                    {row.inlineComment && (
                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-tertiary)',
                        marginTop: 2,
                      }}>
                        {row.inlineComment}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: 'var(--text-tertiary)',
                    flexShrink: 0,
                  }}>
                    {valueDisplay}
                  </span>
                  <span style={{
                    display: 'inline-block',
                    padding: '1px 7px',
                    borderRadius: 999,
                    fontSize: '0.6875rem',
                    fontWeight: 500,
                    flexShrink: 0,
                    ...(isExists
                      ? {
                          background: 'rgba(245,165,36,0.15)',
                          color: 'var(--color-warning)',
                          border: '1px solid rgba(245,165,36,0.25)',
                        }
                      : {
                          background: 'rgba(34,197,94,0.15)',
                          color: 'var(--color-success)',
                          border: '1px solid rgba(34,197,94,0.25)',
                        }
                    ),
                  }}>
                    {isExists ? 'Already set' : 'New'}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              {plan.newCount} key{plan.newCount !== 1 ? 's' : ''} to import
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setStep('prompt')}
                aria-label="Back"
                style={{
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                }}
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={plan.newCount === 0}
                aria-label={`Import ${plan.newCount} key${plan.newCount !== 1 ? 's' : ''}`}
                style={{
                  background: plan.newCount === 0 ? 'var(--bg-hover)' : 'var(--color-accent)',
                  border: 'none',
                  color: plan.newCount === 0 ? 'var(--text-tertiary)' : '#fff',
                  borderRadius: 6,
                  padding: '6px 14px',
                  fontSize: '0.8125rem',
                  cursor: plan.newCount === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Import {plan.newCount} key{plan.newCount !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Done Step ──────────────────────────────────────────────────────────
  return (
    <div style={overlayStyle} data-testid="example-done-overlay">
      <div
        style={{
          ...dialogStyle,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Import complete"
        data-testid="example-done-dialog"
      >
        <div style={{
          fontSize: 32,
          marginBottom: 12,
          color: 'var(--color-success)',
        }}>
          ✓
        </div>
        <div style={{
          fontSize: '0.9375rem',
          color: 'var(--text-primary)',
          fontWeight: 600,
        }}>
          Imported {importedCount} variable{importedCount !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
