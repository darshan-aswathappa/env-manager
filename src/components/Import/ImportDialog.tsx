import { useState, useEffect, useCallback, useMemo } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { X, Upload } from 'lucide-react'
import type { Project, EnvVar, ConflictStrategy, ImportStep, ExportFormat } from '../../types'
import { readFileContent } from '../../lib/envFile'
import {
  detectFormat,
  parseByFormat,
  buildImportConflictReport,
  mergeVarsForImport,
  FormatParseError,
} from '../../lib/envFormats'

// ── Props ─────────────────────────────────────────────────────────────────

export interface ImportDialogProps {
  project: Project
  onImportComplete: (mergedVars: EnvVar[]) => void
  onClose: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: 'new' | 'same' | 'conflict' }) {
  const styles: Record<string, React.CSSProperties> = {
    new:      { background: 'rgba(34,197,94,0.15)',  color: 'var(--color-success)',  border: '1px solid rgba(34,197,94,0.25)'  },
    same:     { background: 'rgba(255,255,255,0.05)', color: 'var(--text-tertiary)', border: '1px solid rgba(255,255,255,0.08)' },
    conflict: { background: 'rgba(245,165,36,0.15)', color: 'var(--color-warning)',  border: '1px solid rgba(245,165,36,0.25)' },
  }
  const labels = { new: 'New', same: 'Same', conflict: 'Conflict' }
  return (
    <span style={{
      ...styles[status],
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 999,
      fontSize: '0.6875rem',
      fontWeight: 500,
    }}>
      {labels[status]}
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ImportDialog({ project, onImportComplete, onClose }: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('pick')
  const [rawContent, setRawContent] = useState('')
  const [_filename, setFilename] = useState('')
  const [detectedFormat, setDetectedFormat] = useState<ExportFormat>('env')
  const [overrideFormat, setOverrideFormat] = useState<ExportFormat | null>(null)
  const [parseResult, setParseResult] = useState<{ vars: EnvVar[]; warnings: string[] } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [revealValues, setRevealValues] = useState(false)
  const [perKeyDecisions, setPerKeyDecisions] = useState<Map<string, ConflictStrategy>>(new Map())
  const [importSummary, setImportSummary] = useState<{ added: number; updated: number; unchanged: number } | null>(null)

  const effectiveFormat = overrideFormat ?? detectedFormat

  // ── Conflict report derived from parse result and project vars ───────────
  const conflictReport = useMemo(() => {
    if (!parseResult) return null
    return buildImportConflictReport(parseResult.vars, project.vars)
  }, [parseResult, project.vars])

  // ── Re-parse when format override changes ────────────────────────────────
  useEffect(() => {
    if (!rawContent) return
    try {
      const result = parseByFormat(rawContent, effectiveFormat, project.id)
      setParseResult(result)
      setParseError(null)
    } catch (e) {
      if (e instanceof FormatParseError) {
        setParseError(e.message)
        setParseResult(null)
      }
    }
  }, [rawContent, effectiveFormat, project.id])

  // ── File selection handler ───────────────────────────────────────────────
  const handleChooseFile = useCallback(async () => {
    const path = await open({
      multiple: false,
      filters: [
        { name: 'Env files', extensions: ['env', 'json', 'yaml', 'yml', 'csv', 'sh'] },
      ],
    })
    if (!path || Array.isArray(path)) return

    const fname = (path as string).split('/').pop() ?? ''
    const content = await readFileContent(path as string)
    const fmt = detectFormat(fname, content)

    setFilename(fname)
    setRawContent(content)
    setDetectedFormat(fmt)
    setOverrideFormat(null)
    setRevealValues(false)

    try {
      const result = parseByFormat(content, fmt, project.id)
      setParseResult(result)
      setParseError(null)
      setStep('preview')
    } catch (e) {
      if (e instanceof FormatParseError) {
        setParseError(e.message)
        setParseResult(null)
        setStep('preview') // show error in preview step
      }
    }
  }, [project.id])

  // ── Commit handler ───────────────────────────────────────────────────────
  const handleImport = useCallback(() => {
    if (!parseResult || !conflictReport) return

    const merged = mergeVarsForImport(parseResult.vars, project.vars, perKeyDecisions, project.id)
    onImportComplete(merged)

    // Compute summary
    const added = conflictReport.newKeys.length
    const updated = conflictReport.conflictDifferent.filter(d => {
      const dec = perKeyDecisions.get(d.key) ?? 'overwrite'
      return dec === 'overwrite'
    }).length
    const unchanged = conflictReport.conflictSame.length + conflictReport.conflictDifferent.filter(d => {
      const dec = perKeyDecisions.get(d.key) ?? 'overwrite'
      return dec === 'skip'
    }).length
    setImportSummary({ added, updated, unchanged })
    setStep('done')
  }, [parseResult, conflictReport, project.vars, project.id, perKeyDecisions, onImportComplete])

  // ── Count vars that will actually be imported ────────────────────────────
  const importCount = useMemo(() => {
    if (!conflictReport) return 0
    const skippedSame = conflictReport.conflictSame.length
    const skippedConflict = conflictReport.conflictDifferent.filter(d => {
      return (perKeyDecisions.get(d.key) ?? 'overwrite') === 'skip'
    }).length
    return (parseResult?.vars.length ?? 0) - skippedSame - skippedConflict
  }, [conflictReport, parseResult, perKeyDecisions])

  // ── Auto-dismiss after 1.2s on done ─────────────────────────────────────
  useEffect(() => {
    if (step !== 'done') return
    const timer = setTimeout(onClose, 1200)
    return () => clearTimeout(timer)
  }, [step, onClose])

  // ── Styles ───────────────────────────────────────────────────────────────
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const dialogStyle: React.CSSProperties = {
    background: 'var(--bg-sidebar)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    width: 600,
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-separator)',
    flexShrink: 0,
  }

  // ── Render steps ──────────────────────────────────────────────────────────

  if (step === 'done' && importSummary) {
    return (
      <div style={overlayStyle} onClick={onClose} role="presentation" tabIndex={-1}>
        <div style={dialogStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import complete">
          <div style={headerStyle}>
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Import complete
            </span>
            <button className="modal-close" onClick={onClose} aria-label="Close" style={{ position: 'relative', top: 'auto', right: 'auto' }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>✓</div>
            <p style={{ color: 'var(--text-primary)', fontSize: '1rem', fontWeight: 600 }}>
              Imported {importSummary.added + importSummary.updated} variable{importSummary.added + importSummary.updated !== 1 ? 's' : ''}
            </p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: 4 }}>
              {importSummary.added} added · {importSummary.updated} updated · {importSummary.unchanged} unchanged
            </p>
            <button
              className="btn-primary"
              onClick={onClose}
              style={{ marginTop: 20 }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'conflicts' && conflictReport) {
    const decisionCount = importCount
    return (
      <div style={overlayStyle} onClick={onClose} role="presentation" tabIndex={-1}>
        <div style={dialogStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Resolve import conflicts">
          <div style={headerStyle}>
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Resolve conflicts
            </span>
            <button className="modal-close" onClick={onClose} aria-label="Close" style={{ position: 'relative', top: 'auto', right: 'auto' }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-separator)', flexShrink: 0 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {conflictReport.conflictDifferent.length} conflict{conflictReport.conflictDifferent.length !== 1 ? 's' : ''} found. Choose how to handle each one.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  const next = new Map(perKeyDecisions)
                  conflictReport.conflictDifferent.forEach(d => next.set(d.key, 'overwrite'))
                  setPerKeyDecisions(next)
                }}
              >
                Overwrite All
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  const next = new Map(perKeyDecisions)
                  conflictReport.conflictDifferent.forEach(d => next.set(d.key, 'skip'))
                  setPerKeyDecisions(next)
                }}
              >
                Skip All
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-separator)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 20px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Key</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Decision</th>
                </tr>
              </thead>
              <tbody>
                {conflictReport.conflictDifferent.map(d => {
                  const decision = perKeyDecisions.get(d.key) ?? 'overwrite'
                  return (
                    <tr key={d.key} style={{ borderBottom: '1px solid var(--border-separator)' }}>
                      <td style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
                        {d.key}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button
                          style={{
                            padding: '3px 10px',
                            borderRadius: 'var(--radius-md)',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            background: decision === 'overwrite' ? 'var(--color-warning-bg)' : 'rgba(255,255,255,0.05)',
                            color: decision === 'overwrite' ? 'var(--color-warning)' : 'var(--text-secondary)',
                            border: decision === 'overwrite' ? '1px solid rgba(245,165,36,0.2)' : '1px solid rgba(255,255,255,0.06)',
                          }}
                          onClick={() => {
                            const next = new Map(perKeyDecisions)
                            next.set(d.key, decision === 'overwrite' ? 'skip' : 'overwrite')
                            setPerKeyDecisions(next)
                          }}
                        >
                          {decision === 'overwrite' ? 'Overwrite' : 'Skip'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-separator)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button className="btn-secondary" onClick={() => setStep('preview')}>Back</button>
            <button className="btn-primary" onClick={handleImport}>
              Import {decisionCount} variable{decisionCount !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'preview') {
    const hasConflicts = (conflictReport?.conflictDifferent.length ?? 0) > 0

    // Build preview rows
    const previewRows = parseResult?.vars.map(v => {
      const existingVar = project.vars.find(ev => ev.key === v.key)
      let status: 'new' | 'same' | 'conflict' = 'new'
      if (existingVar) {
        status = existingVar.val === v.val ? 'same' : 'conflict'
      }
      return { key: v.key, status, incomingVal: v.val, currentVal: existingVar?.val ?? null }
    }) ?? []

    return (
      <div style={overlayStyle} onClick={onClose} role="presentation" tabIndex={-1}>
        <div style={dialogStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import preview">
          <div style={headerStyle}>
            <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Preview import
            </span>
            <button className="modal-close" onClick={onClose} aria-label="Close" style={{ position: 'relative', top: 'auto', right: 'auto' }}>
              <X size={14} />
            </button>
          </div>

          {/* Format badge + reveal toggle */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border-separator)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {`Detected: ${effectiveFormat}`}
            </span>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                aria-label="Reveal values"
                checked={revealValues}
                onChange={e => setRevealValues(e.target.checked)}
                style={{ accentColor: 'var(--accent)' }}
              />
              Reveal values
            </label>
          </div>

          {/* Error state */}
          {parseError && (
            <div style={{ padding: '16px 20px', color: 'var(--color-danger)', fontSize: '0.875rem', background: 'var(--color-danger-bg)' }}>
              {parseError}
            </div>
          )}

          {/* Warnings */}
          {parseResult && parseResult.warnings.length > 0 && (
            <div style={{ padding: '8px 20px', background: 'var(--color-warning-bg)', fontSize: '0.8125rem', color: 'var(--color-warning)', flexShrink: 0 }}>
              {parseResult.warnings.join(' · ')}
            </div>
          )}

          {/* Preview table */}
          {parseResult && !parseError && (
            <>
              {parseResult.vars.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  No variables found in this file.
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-separator)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 20px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Key</th>
                        <th style={{ textAlign: 'left', padding: '8px 8px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Incoming Value</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: '0.75rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>Current Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map(row => (
                        <tr key={row.key} style={{ borderBottom: '1px solid var(--border-separator)' }}>
                          <td style={{ padding: '9px 20px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-primary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.key}
                          </td>
                          <td style={{ padding: '9px 8px' }}>
                            <StatusBadge status={row.status} />
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                            {revealValues ? row.incomingVal : '••••••'}
                          </td>
                          <td style={{ padding: '9px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                            {row.currentVal !== null ? (revealValues ? row.currentVal : '••••••') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-separator)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            {!parseError && parseResult && parseResult.vars.length > 0 && (
              hasConflicts ? (
                <button className="btn-primary" onClick={() => {
                  // Init decisions to overwrite for all conflicts
                  const next = new Map<string, ConflictStrategy>()
                  conflictReport?.conflictDifferent.forEach(d => next.set(d.key, 'overwrite'))
                  setPerKeyDecisions(next)
                  setStep('conflicts')
                }}>
                  Next
                </button>
              ) : (
                <button className="btn-primary" onClick={handleImport} disabled={parseResult.vars.length === 0}>
                  Import {importCount} variable{importCount !== 1 ? 's' : ''}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    )
  }

  // Step 1: Pick file
  return (
    <div style={overlayStyle} onClick={onClose} role="presentation" tabIndex={-1}>
      <div style={dialogStyle} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Import variables">
        <div style={headerStyle}>
          <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Import variables
          </span>
          <button className="modal-close" onClick={onClose} aria-label="Close" style={{ position: 'relative', top: 'auto', right: 'auto' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 }}>
          <div style={{
            border: '2px dashed var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '40px 60px',
            textAlign: 'center',
            width: '100%',
          }}>
            <Upload size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: 16 }}>
              Choose a file to import variables from
            </p>
            <button className="btn-primary" onClick={handleChooseFile}>
              Choose File
            </button>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: 12 }}>
              Supported: .env, .json, .yaml, .yml, .csv, .sh
            </p>
          </div>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-separator)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
