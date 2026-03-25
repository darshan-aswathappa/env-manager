import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Search, X } from 'lucide-react'
import type { Project, EnvVar, ConflictReport, ConflictStrategy } from '../../types'
import { envDisplayName } from '../../types'
import { previewPushVarsToStage, pushVarsToStage } from '../../lib/envFile'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PushToStagePanelProps {
  project: Project
  sourceSuffix: string
  onClose: () => void
  onPushComplete: (
    targetSuffix: string,
    updatedVars: EnvVar[],
    snapshot: string | null
  ) => void
}

type PushStatus = 'idle' | 'pushing' | 'success' | 'error'

// ── Helpers ────────────────────────────────────────────────────────────────

function valuePreview(v: EnvVar): string {
  if (!v.val) return ''
  if (!v.revealed) return '••••••••'
  return v.val.length > 24 ? v.val.slice(0, 24) + '…' : v.val
}

// ── Sub-components ─────────────────────────────────────────────────────────

interface VarRowProps {
  v: EnvVar
  selected: boolean
  onToggle: (id: string) => void
  conflictBadge: 'overwrite' | 'skip' | 'same' | null
  onToggleConflict: (key: string) => void
}

function VarRow({ v, selected, onToggle, conflictBadge, onToggleConflict }: VarRowProps) {
  const preview = valuePreview(v)

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    cursor: 'pointer',
    transition: 'background var(--t-fast)',
    borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
    background: selected ? 'var(--bg-row-active)' : 'transparent',
    userSelect: 'none',
  }

  return (
    <div
      data-testid={`var-row-${v.id}`}
      style={rowStyle}
      onClick={() => onToggle(v.id)}
      role="row"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(v.id)
        }
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-row-hover)'
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
      }}
      aria-selected={selected}
    >
      <input
        data-testid={`var-checkbox-${v.id}`}
        type="checkbox"
        checked={selected}
        readOnly
        onClick={(e) => e.stopPropagation()}
        style={{ accentColor: 'var(--accent)', flexShrink: 0, cursor: 'pointer' }}
        aria-label={`Select ${v.key}`}
      />
      <span
        style={{
          flex: 1,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {v.key}
      </span>
      {preview && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 120,
          }}
        >
          {preview}
        </span>
      )}
      {conflictBadge && (
        <ConflictBadge
          varKey={v.key}
          badge={conflictBadge}
          onToggle={onToggleConflict}
        />
      )}
    </div>
  )
}

interface ConflictBadgeProps {
  varKey: string
  badge: 'overwrite' | 'skip' | 'same'
  onToggle: (key: string) => void
}

function ConflictBadge({ varKey, badge, onToggle }: ConflictBadgeProps) {
  const isSame = badge === 'same'
  const isSkip = badge === 'skip'

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 6px',
    borderRadius: 'var(--radius-md)',
    fontSize: '0.6875rem',
    fontWeight: 500,
    letterSpacing: '0.02em',
    cursor: isSame ? 'default' : 'pointer',
    flexShrink: 0,
    background: isSame
      ? 'rgba(255,255,255,0.05)'
      : isSkip
        ? 'rgba(255,255,255,0.05)'
        : 'var(--color-warning-bg)',
    color: isSame
      ? 'var(--text-tertiary)'
      : isSkip
        ? 'var(--text-secondary)'
        : 'var(--color-warning)',
    border: isSame
      ? '1px solid rgba(255,255,255,0.06)'
      : isSkip
        ? '1px solid rgba(255,255,255,0.06)'
        : '1px solid rgba(245,165,36,0.2)',
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!isSame) onToggle(varKey)
  }

  return (
    <span
      data-testid={`conflict-badge-${varKey}`}
      style={style}
      onClick={handleClick}
      title={isSame ? 'Identical value — will be skipped' : isSkip ? 'Click to overwrite' : 'Click to skip'}
    >
      {isSame ? '≡' : isSkip ? 'skip' : 'overwrite'}
    </span>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PushToStagePanel({
  project,
  sourceSuffix,
  onClose,
  onPushComplete,
}: PushToStagePanelProps) {
  const [selectedVarIds, setSelectedVarIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [targetSuffix, setTargetSuffix] = useState('')
  const [conflictReport, setConflictReport] = useState<ConflictReport | null>(null)
  const [conflictDecisions, setConflictDecisions] = useState<Map<string, ConflictStrategy>>(new Map())
  const [pushStatus, setPushStatus] = useState<PushStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  // Auto-focus panel on mount so keyboard users are not stranded
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // ── Derived: filtered vars ──────────────────────────────────────────────
  const q = searchQuery.trim().toLowerCase()
  const filteredVars = useMemo(
    () => (q ? project.vars.filter((v) => v.key.toLowerCase().includes(q)) : project.vars),
    [project.vars, q]
  )

  const filteredIds = useMemo(() => new Set(filteredVars.map((v) => v.id)), [filteredVars])

  // ── Derived: conflict key lookup ───────────────────────────────────────
  const differentKeys = useMemo(
    () => new Set((conflictReport?.conflictDifferent ?? []).map((d) => d.key)),
    [conflictReport]
  )
  const sameKeys = useMemo(
    () => new Set(conflictReport?.conflictSame ?? []),
    [conflictReport]
  )

  // ── Selection helpers ──────────────────────────────────────────────────
  const selectedCount = selectedVarIds.size
  const hiddenSelectedCount = useMemo(
    () => [...selectedVarIds].filter((id) => !filteredIds.has(id)).length,
    [selectedVarIds, filteredIds]
  )

  const visibleSelectedCount = selectedCount - hiddenSelectedCount
  const allVisibleSelected = filteredVars.length > 0 && visibleSelectedCount === filteredVars.length
  const someVisibleSelected = visibleSelectedCount > 0 && visibleSelectedCount < filteredVars.length

  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  const toggleVar = useCallback((id: string) => {
    setSelectedVarIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (allVisibleSelected) {
      // Deselect all visible
      setSelectedVarIds((prev) => {
        const next = new Set(prev)
        filteredVars.forEach((v) => next.delete(v.id))
        return next
      })
    } else {
      // Select all visible
      setSelectedVarIds((prev) => {
        const next = new Set(prev)
        filteredVars.forEach((v) => next.add(v.id))
        return next
      })
    }
  }, [allVisibleSelected, filteredVars])

  const selectAllVisible = useCallback(() => {
    setSelectedVarIds((prev) => {
      const next = new Set(prev)
      filteredVars.forEach((v) => next.add(v.id))
      return next
    })
  }, [filteredVars])

  // ── Stage options ──────────────────────────────────────────────────────
  const stageOptions = useMemo(() => {
    const suffixes = project.environments
      .map((e) => e.suffix)
      .filter((s) => s !== sourceSuffix)

    // Deduplicate while preserving order
    return [...new Set(suffixes)]
  }, [project.environments, sourceSuffix])

  const getEnvVarCount = useCallback(
    (suffix: string) => {
      const env = project.environments.find((e) => e.suffix === suffix)
      return env ? env.vars.length : 0
    },
    [project.environments]
  )

  // ── Stage selection: triggers conflict preview ─────────────────────────
  const handleStageChange = useCallback(
    async (newSuffix: string) => {
      setTargetSuffix(newSuffix)
      setConflictReport(null)
      setConflictDecisions(new Map())
      setErrorMsg(null)

      if (!newSuffix) return

      try {
        const varsToPush = project.vars.map((v) => ({ key: v.key, val: v.val }))
        const report = await previewPushVarsToStage(project.id, newSuffix, varsToPush)
        setConflictReport(report)
      } catch {
        // Non-fatal: preview failed, continue without conflict info
        setConflictReport({ newKeys: [], conflictSame: [], conflictDifferent: [] })
      }
    },
    [project.id, project.vars]
  )

  // ── Conflict decision toggle ───────────────────────────────────────────
  const toggleConflictDecision = useCallback(
    (key: string) => {
      setConflictDecisions((prev) => {
        const current = prev.get(key) ?? 'overwrite'
        const next = new Map(prev)
        const newDecision: ConflictStrategy = current === 'overwrite' ? 'skip' : 'overwrite'
        next.set(key, newDecision)
        return next
      })

      // Find the var with this key and deselect if switching to 'skip'
      const currentDecision = conflictDecisions.get(key) ?? 'overwrite'
      if (currentDecision === 'overwrite') {
        // Switching to skip — deselect the var
        const varToDeselect = project.vars.find((v) => v.key === key)
        if (varToDeselect) {
          setSelectedVarIds((prev) => {
            const next = new Set(prev)
            next.delete(varToDeselect.id)
            return next
          })
        }
      }
    },
    [conflictDecisions, project.vars]
  )

  // ── Get badge for a var ────────────────────────────────────────────────
  const getBadge = useCallback(
    (v: EnvVar): 'overwrite' | 'skip' | 'same' | null => {
      if (!conflictReport || !targetSuffix) return null
      if (sameKeys.has(v.key)) return 'same'
      if (differentKeys.has(v.key)) {
        const decision = conflictDecisions.get(v.key) ?? 'overwrite'
        return decision === 'skip' ? 'skip' : 'overwrite'
      }
      return null
    },
    [conflictReport, targetSuffix, sameKeys, differentKeys, conflictDecisions]
  )

  // ── Compute effective push count ──────────────────────────────────────
  const effectivePushCount = useMemo(() => {
    if (!conflictReport || !targetSuffix) return selectedCount
    let count = 0
    for (const id of selectedVarIds) {
      const v = project.vars.find((vv) => vv.id === id)
      if (!v) continue
      if (sameKeys.has(v.key)) continue // auto-skipped
      const decision = conflictDecisions.get(v.key) ?? 'overwrite'
      if (differentKeys.has(v.key) && decision === 'skip') continue // manually skipped
      count++
    }
    return count
  }, [selectedVarIds, project.vars, conflictReport, targetSuffix, sameKeys, differentKeys, conflictDecisions, selectedCount])

  // ── Summary counts ────────────────────────────────────────────────────
  const summary = useMemo(() => {
    if (!conflictReport || !targetSuffix) return null
    let newCount = 0
    let overwriteCount = 0
    let identicalCount = 0

    for (const id of selectedVarIds) {
      const v = project.vars.find((vv) => vv.id === id)
      if (!v) continue
      if (sameKeys.has(v.key)) {
        identicalCount++
      } else if (differentKeys.has(v.key)) {
        const decision = conflictDecisions.get(v.key) ?? 'overwrite'
        if (decision === 'overwrite') overwriteCount++
      } else if (conflictReport.newKeys.includes(v.key)) {
        newCount++
      }
    }

    return { newCount, overwriteCount, identicalCount }
  }, [selectedVarIds, project.vars, conflictReport, targetSuffix, sameKeys, differentKeys, conflictDecisions])

  // ── Push action ────────────────────────────────────────────────────────
  const handlePush = useCallback(async () => {
    if (!targetSuffix || pushStatus === 'pushing') return

    const selectedVars = project.vars.filter((v) => selectedVarIds.has(v.id))

    // Filter out identical and skip-decided vars
    const effectiveVars = selectedVars.filter((v) => {
      if (sameKeys.has(v.key)) return false
      const decision = conflictDecisions.get(v.key) ?? 'overwrite'
      if (differentKeys.has(v.key) && decision === 'skip') return false
      return true
    })

    if (effectiveVars.length === 0) return

    setPushStatus('pushing')
    setErrorMsg(null)

    try {
      const result = await pushVarsToStage({
        projectId: project.id,
        sourceSuffix,
        targetSuffix,
        varsToPush: effectiveVars.map((v) => ({ key: v.key, val: v.val })),
        conflictDecisions,
      })

      setPushStatus('success')
      onPushComplete(targetSuffix, result.updatedVars, result.snapshot)
    } catch (err) {
      setPushStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Push failed. Please try again.')
    }
  }, [
    targetSuffix,
    pushStatus,
    project,
    selectedVarIds,
    sourceSuffix,
    conflictDecisions,
    sameKeys,
    differentKeys,
    onPushComplete,
  ])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        selectAllVisible()
      }
    },
    [onClose, selectAllVisible]
  )

  // ── CTA state ──────────────────────────────────────────────────────────
  const nothingToPush = targetSuffix !== '' && selectedCount > 0 && effectivePushCount === 0
  const ctaDisabled =
    pushStatus === 'pushing' ||
    !targetSuffix ||
    effectivePushCount === 0

  const ctaLabel = nothingToPush
    ? 'Nothing to push — all values match'
    : targetSuffix
      ? `Push ${effectivePushCount} variable${effectivePushCount !== 1 ? 's' : ''} to ${envDisplayName(targetSuffix)}`
      : 'Select a target stage'

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      ref={panelRef}
      data-testid="push-to-stage-panel"
      className="push-panel"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        background: 'var(--bg-sidebar)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
      }}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label="Push Variables to Stage"
      aria-modal="true"
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '16px 16px 12px',
          borderBottom: '1px solid var(--border-separator)',
          flexShrink: 0,
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            Push Variables
          </div>
          <div
            style={{
              fontSize: '0.8125rem',
              color: 'var(--text-secondary)',
              marginTop: 2,
            }}
          >
            from{' '}
            <span className="inline-code" style={{ color: 'var(--accent-text)' }}>
              {envDisplayName(sourceSuffix)}
            </span>
          </div>
        </div>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close panel"
          style={{ position: 'relative', top: 'auto', right: 'auto', flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px 0', flexShrink: 0 }}>
        <div className="search-input-wrap">
          <span className="search-icon" aria-hidden="true">
            <Search size={13} />
          </span>
          <input
            data-testid="push-search-input"
            className="search-input"
            type="search"
            placeholder="Filter variables…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter variables"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Variable list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {project.vars.length === 0 ? (
          <div
            className="empty-state"
            style={{ padding: '40px 20px', fontSize: '0.875rem', color: 'var(--text-secondary)' }}
          >
            <span>No variables in this environment.</span>
          </div>
        ) : (
          <>
            {/* Select-all header row */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                borderBottom: '1px solid var(--border-separator)',
                flexShrink: 0,
              }}
            >
              <input
                ref={selectAllRef}
                data-testid="select-all-checkbox"
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleSelectAll}
                style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                aria-label="Select all visible variables"
              />
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  userSelect: 'none',
                }}
              >
                {filteredVars.length} variable{filteredVars.length !== 1 ? 's' : ''}
                {q ? ` matching "${searchQuery}"` : ''}
              </span>
            </div>

            {/* Var rows */}
            <div role="rowgroup">
              {filteredVars.length === 0 && q && (
                <div
                  style={{
                    padding: '20px 16px',
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                  }}
                >
                  No results for "{searchQuery}"
                </div>
              )}
              {filteredVars.map((v) => (
                <VarRow
                  key={v.id}
                  v={v}
                  selected={selectedVarIds.has(v.id)}
                  onToggle={toggleVar}
                  conflictBadge={getBadge(v)}
                  onToggleConflict={toggleConflictDecision}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Helper text: hidden selections */}
      {hiddenSelectedCount > 0 && q && (
        <div
          style={{
            padding: '6px 16px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            background: 'var(--accent-dim)',
            borderTop: '1px solid var(--border-separator)',
            flexShrink: 0,
          }}
        >
          {selectedCount} selected, {hiddenSelectedCount} hidden by filter
        </div>
      )}

      {/* Error message */}
      {errorMsg && (
        <div
          data-testid="error-message"
          style={{
            padding: '8px 16px',
            fontSize: '0.8125rem',
            color: 'var(--color-danger)',
            background: 'var(--color-danger-bg)',
            borderTop: '1px solid rgba(229,72,77,0.15)',
            flexShrink: 0,
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Sticky footer */}
      <div
        style={{
          borderTop: '1px solid var(--border-separator)',
          padding: '12px 16px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Stage selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', flexShrink: 0 }}
          >
            Push to
          </span>
          <select
            data-testid="stage-selector"
            value={targetSuffix}
            onChange={(e) => handleStageChange(e.target.value)}
            aria-label="Target stage"
            style={{
              flex: 1,
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              color: targetSuffix ? 'var(--text-primary)' : 'var(--text-secondary)',
              padding: '5px 8px',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="">— select stage —</option>
            {stageOptions.map((suffix) => {
              const count = getEnvVarCount(suffix)
              const label = envDisplayName(suffix)
              const emptyLabel = count === 0 ? ' (empty)' : ''
              return (
                <option key={suffix} value={suffix}>
                  {label}{emptyLabel}
                </option>
              )
            })}
          </select>
          <span
            style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', flexShrink: 0 }}
          >
            from{' '}
            <span className="inline-code" style={{ color: 'var(--text-tertiary)' }}>
              {envDisplayName(sourceSuffix)}
            </span>
          </span>
        </div>

        {/* Summary bar */}
        {summary && (
          <>
            <div
              style={{
                height: 1,
                background: 'var(--border-separator)',
              }}
            />
            <div
              data-testid="summary-bar"
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                gap: 12,
              }}
            >
              <span>
                <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                  {summary.newCount} new
                </span>
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              <span>
                <span
                  style={{
                    color:
                      summary.overwriteCount > 0 ? 'var(--color-warning)' : 'var(--text-secondary)',
                    fontWeight: summary.overwriteCount > 0 ? 500 : 400,
                  }}
                >
                  {summary.overwriteCount} overwrite
                </span>
              </span>
              <span style={{ color: 'var(--text-tertiary)' }}>·</span>
              <span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {summary.identicalCount} identical
                </span>
              </span>
            </div>
          </>
        )}

        {/* CTA button */}
        <button
          data-testid="push-cta-button"
          className="btn-primary"
          onClick={handlePush}
          disabled={ctaDisabled}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {pushStatus === 'pushing' ? 'Pushing…' : ctaLabel}
        </button>
      </div>
    </div>
  )
}
