import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { X, ArrowLeftRight, Eye, EyeOff, Copy, Check, RotateCcw, ArrowRight } from 'lucide-react'
import type { Project, EnvVar, DiffEntry } from '../../types'
import { envDisplayName } from '../../types'
import { computeEnvDiff } from '../../lib/envDiff'
import { valuePreview, pushVarsToStage } from '../../lib/envFile'

// ── Types ──────────────────────────────────────────────────────────────────

export interface DiffViewPanelProps {
  project: Project
  initialLeftSuffix: string
  onClose: () => void
  onPushComplete: (targetSuffix: string, updatedVars: EnvVar[], snapshot: string | null) => void
}

type FilterMode = 'all' | 'added' | 'removed' | 'modified' | 'identical'

// ── EnvSelector ────────────────────────────────────────────────────────────

interface EnvSelectorProps {
  label: string
  value: string
  options: string[]
  disabledValue: string
  onChange: (v: string) => void
}

function EnvSelector({ label, value, options, disabledValue, onChange }: EnvSelectorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--text-primary)',
          padding: '4px 8px',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          outline: 'none',
          minWidth: 140,
        }}
      >
        {options.map((s) => (
          <option key={s} value={s} disabled={s === disabledValue}>
            {envDisplayName(s)}
          </option>
        ))}
      </select>
    </div>
  )
}

// ── ConfirmPopover ─────────────────────────────────────────────────────────

interface ConfirmPopoverProps {
  varKey: string
  targetEnv: string
  onConfirm: () => void
  onCancel: () => void
  error: string | null
  pushing: boolean
}

function ConfirmPopover({ varKey, targetEnv, onConfirm, onCancel, error, pushing }: ConfirmPopoverProps) {
  return (
    <div
      role="dialog"
      aria-label="Confirm push"
      style={{
        position: 'absolute',
        right: 48,
        top: 0,
        zIndex: 10,
        background: 'var(--bg-sidebar)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '10px 12px',
        minWidth: 220,
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary)', marginBottom: 8 }}>
        Add <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--accent-text)' }}>{varKey}</code>{' '}
        to <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>{envDisplayName(targetEnv)}</code>?
      </div>
      {error && (
        <div style={{ fontSize: '0.75rem', color: 'var(--color-danger)', marginBottom: 6 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn-primary"
          aria-label="Confirm push"
          onClick={onConfirm}
          disabled={pushing}
          style={{ fontSize: '0.75rem', padding: '3px 10px' }}
        >
          {pushing ? '…' : 'Add'}
        </button>
        <button
          aria-label="Cancel push"
          onClick={onCancel}
          style={{
            fontSize: '0.75rem',
            padding: '3px 10px',
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

// ── DiffRow ────────────────────────────────────────────────────────────────

interface DiffRowProps {
  entry: DiffEntry
  revealAll: boolean
  targetSuffix: string
  onPushSingle: (entry: DiffEntry, targetSuffix: string) => Promise<void>
}

const STATUS_COLORS: Record<string, string> = {
  added:     'var(--color-success, #4caf50)',
  removed:   'var(--color-danger, #e5484d)',
  modified:  'var(--color-warning, #f5a524)',
  unchanged: 'var(--text-tertiary)',
}

const STATUS_LABELS: Record<string, string> = {
  added:     'added',
  removed:   'removed',
  modified:  'modified',
  unchanged: 'identical',
}

function DiffRow({ entry, revealAll, targetSuffix, onPushSingle }: DiffRowProps) {
  const [rowRevealed, setRowRevealed] = useState(false)
  const [showPopover, setShowPopover] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushing, setPushing] = useState(false)
  const [copied, setCopied] = useState(false)

  const isRevealed = revealAll || rowRevealed
  const color = STATUS_COLORS[entry.status]
  const canPush = entry.status === 'added' || entry.status === 'removed'

  const leftDisplay = entry.leftVal !== null ? valuePreview(entry.leftVal, isRevealed) : null
  const rightDisplay = entry.rightVal !== null ? valuePreview(entry.rightVal, isRevealed) : null

  const handleReveal = () => setRowRevealed((r) => !r)

  const handleCopy = async () => {
    const val = entry.leftVal ?? entry.rightVal ?? ''
    try {
      await navigator.clipboard.writeText(val)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  const handlePushConfirm = async () => {
    setPushing(true)
    setPushError(null)
    try {
      await onPushSingle(entry, targetSuffix)
      setShowPopover(false)
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Push failed')
    } finally {
      setPushing(false)
    }
  }

  const ariaLabel = `${entry.key}: ${
    entry.status === 'added' ? `missing in left env, present in ${envDisplayName(targetSuffix)}` :
    entry.status === 'removed' ? `present in left env, missing in ${envDisplayName(targetSuffix)}` :
    entry.status === 'modified' ? 'value differs between envs' :
    'identical in both envs'
  }`

  return (
    <li
      role="listitem"
      data-testid={`diff-row-${entry.key}`}
      aria-label={ariaLabel}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderLeft: `3px solid ${color}`,
        position: 'relative',
      }}
    >
      {/* Status indicator */}
      <span style={{ fontSize: '0.6875rem', color, fontWeight: 600, minWidth: 56, flexShrink: 0 }}>
        {STATUS_LABELS[entry.status]}
      </span>

      {/* Key name */}
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          color: 'var(--text-primary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.key}
      </span>

      {/* Left value */}
      {entry.leftVal !== null && (
        <span
          data-testid="left-val"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {leftDisplay}
        </span>
      )}

      {/* Right value */}
      {entry.rightVal !== null && (
        <span
          data-testid="right-val"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            maxWidth: 100,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {rightDisplay}
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        {/* Reveal toggle */}
        {(entry.leftVal !== null || entry.rightVal !== null) && (
          <button
            className="icon-btn"
            onClick={handleReveal}
            aria-label={isRevealed && !revealAll ? 'Mask value' : 'Reveal value'}
            aria-pressed={isRevealed}
            title={isRevealed && !revealAll ? 'Mask' : 'Reveal'}
          >
            {isRevealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        )}

        {/* Copy (only when revealed) */}
        {isRevealed && (entry.leftVal !== null || entry.rightVal !== null) && (
          <button
            className="icon-btn"
            onClick={handleCopy}
            aria-label="Copy value"
            title={copied ? 'Copied!' : 'Copy value'}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}

        {/* Push single key */}
        {canPush && (
          <button
            className="icon-btn"
            onClick={() => setShowPopover((v) => !v)}
            aria-label="Push key to other env"
            title="Push to other env"
          >
            <ArrowRight size={12} />
          </button>
        )}
      </div>

      {/* Confirmation popover */}
      {showPopover && (
        <ConfirmPopover
          varKey={entry.key}
          targetEnv={targetSuffix}
          onConfirm={handlePushConfirm}
          onCancel={() => { setShowPopover(false); setPushError(null) }}
          error={pushError}
          pushing={pushing}
        />
      )}
    </li>
  )
}

// ── Main Panel ─────────────────────────────────────────────────────────────

export default function DiffViewPanel({
  project,
  initialLeftSuffix,
  onClose,
  onPushComplete,
}: DiffViewPanelProps) {
  const availableSuffixes = useMemo(
    () => project.environments.map((e) => e.suffix),
    [project.environments]
  )

  // Default right suffix: next env in order that's different from left
  const defaultRight = useMemo(() => {
    const others = availableSuffixes.filter((s) => s !== initialLeftSuffix)
    return others[0] ?? ''
  }, [availableSuffixes, initialLeftSuffix])

  const [leftSuffix, setLeftSuffix] = useState(initialLeftSuffix)
  const [rightSuffix, setRightSuffix] = useState(defaultRight)
  const [revealAll, setRevealAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterMode>('all')
  const [showIdentical, setShowIdentical] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Reset reveal state when panel re-opens (covered by unmount/mount cycle)
  const handleFilterChange = (mode: FilterMode) => {
    if (mode === 'identical') {
      setShowIdentical((v) => !v)
      setActiveFilter('all')
    } else if (mode === 'all') {
      // "All" shows everything including unchanged
      setShowIdentical(true)
      setActiveFilter('all')
    } else {
      setShowIdentical(false)
      setActiveFilter(mode)
    }
  }

  const handleReset = () => {
    setSearchQuery('')
    setActiveFilter('all')
    setShowIdentical(false)
  }

  const handleSwap = () => {
    setLeftSuffix(rightSuffix)
    setRightSuffix(leftSuffix)
  }

  // Compute diff from in-memory state
  const leftVars = useMemo(
    () => project.environments.find((e) => e.suffix === leftSuffix)?.vars ?? [],
    [project.environments, leftSuffix]
  )
  const rightVars = useMemo(
    () => project.environments.find((e) => e.suffix === rightSuffix)?.vars ?? [],
    [project.environments, rightSuffix]
  )

  const diffResult = useMemo(
    () => computeEnvDiff(leftVars, rightVars, leftSuffix, rightSuffix),
    [leftVars, rightVars, leftSuffix, rightSuffix]
  )

  // Filter entries
  const filteredEntries = useMemo(() => {
    let entries = diffResult.entries

    // Status filter
    if (activeFilter === 'added') {
      entries = entries.filter((e) => e.status === 'added')
    } else if (activeFilter === 'removed') {
      entries = entries.filter((e) => e.status === 'removed')
    } else if (activeFilter === 'modified') {
      entries = entries.filter((e) => e.status === 'modified')
    } else if (!showIdentical) {
      // Default: hide unchanged
      entries = entries.filter((e) => e.status !== 'unchanged')
    }

    // Search filter
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      entries = entries.filter((e) => e.key.toLowerCase().includes(q))
    }

    return entries
  }, [diffResult.entries, activeFilter, showIdentical, searchQuery])

  // Push single key handler
  const handlePushSingle = useCallback(
    async (entry: DiffEntry, targetSuffix: string) => {
      // Determine source and key to push
      const isAdded = entry.status === 'added'
      const sourceSuffix = isAdded ? rightSuffix : leftSuffix
      const val = (isAdded ? entry.rightVal : entry.leftVal) ?? ''

      // Use the leftSuffix as source if the key is 'removed' (key exists in left, not right)
      const effectiveTarget = targetSuffix === rightSuffix ? rightSuffix : leftSuffix

      const result = await pushVarsToStage({
        projectId: project.id,
        sourceSuffix,
        targetSuffix: effectiveTarget,
        varsToPush: [{ key: entry.key, val }],
        conflictDecisions: new Map(),
      })

      onPushComplete(effectiveTarget, result.updatedVars, result.snapshot)
    },
    [project.id, leftSuffix, rightSuffix, onPushComplete]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [onClose]
  )

  // Empty state detection
  const leftEmpty = leftVars.length === 0
  const rightEmpty = rightVars.length === 0
  const allUnchanged =
    diffResult.entries.length > 0 &&
    diffResult.unchangedCount === diffResult.entries.length

  // Determine empty state message
  const noSearchResults = filteredEntries.length === 0 && searchQuery.trim().length > 0
  const showInSyncMessage = allUnchanged && !searchQuery && showIdentical && diffResult.entries.length > 0
  const showNoVarsMessage = (leftEmpty || rightEmpty) && !showInSyncMessage

  return (
    <div
      ref={panelRef}
      data-testid="diff-view-panel"
      role="dialog"
      aria-label="Compare environments"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
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
        animation: 'slideInFromRight 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
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
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            Compare Environments
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 3 }}>
            Reflects last saved state
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

      {/* Env selectors */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-separator)',
          flexShrink: 0,
        }}
      >
        <EnvSelector
          label="Left env"
          value={leftSuffix}
          options={availableSuffixes}
          disabledValue={rightSuffix}
          onChange={setLeftSuffix}
        />
        <button
          className="icon-btn"
          onClick={handleSwap}
          aria-label="Swap environments"
          title="Swap left and right"
          style={{ marginBottom: 2 }}
        >
          <ArrowLeftRight size={13} />
        </button>
        <EnvSelector
          label="Right env"
          value={rightSuffix}
          options={availableSuffixes}
          disabledValue={leftSuffix}
          onChange={setRightSuffix}
        />

        {/* Reveal all toggle */}
        <button
          className="icon-btn"
          onClick={() => setRevealAll((v) => !v)}
          aria-label={revealAll ? 'Mask all values' : 'Reveal all values'}
          aria-pressed={revealAll}
          title={revealAll ? 'Mask all' : 'Reveal all'}
          style={{ marginBottom: 2, marginLeft: 'auto' }}
        >
          {revealAll ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>

      {/* Summary bar */}
      <div
        data-testid="diff-summary"
        style={{
          display: 'flex',
          gap: 12,
          padding: '8px 16px',
          borderBottom: '1px solid var(--border-separator)',
          flexShrink: 0,
          fontSize: '0.75rem',
        }}
      >
        <span style={{ color: 'var(--color-warning, #f5a524)' }}>
          <strong>{diffResult.modifiedCount}</strong> changed
        </span>
        <span style={{ color: 'var(--color-danger, #e5484d)' }}>
          <strong>{diffResult.removedCount}</strong> removed
        </span>
        <span style={{ color: 'var(--color-success, #4caf50)' }}>
          <strong>{diffResult.addedCount}</strong> added
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>
          <strong>{diffResult.unchangedCount}</strong> identical
        </span>
      </div>

      {/* Search + filter pills */}
      <div style={{ padding: '8px 12px', flexShrink: 0 }}>
        {/* Search */}
        <div className="search-input-wrap" style={{ marginBottom: 8 }}>
          <input
            type="search"
            role="searchbox"
            className="search-input"
            placeholder="Filter by key name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search keys"
            spellCheck={false}
            style={{ paddingLeft: 8 }}
          />
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {(
            [
              { mode: 'all', label: 'All' },
              { mode: 'modified', label: 'Changed' },
              { mode: 'removed', label: 'Missing in right' },
              { mode: 'added', label: 'Missing in left' },
              { mode: 'identical', label: 'Identical' },
            ] as { mode: FilterMode; label: string }[]
          ).map(({ mode, label }) => {
            const isActive =
              mode === 'identical' ? showIdentical : activeFilter === mode
            return (
              <button
                key={mode}
                onClick={() => handleFilterChange(mode)}
                aria-pressed={isActive}
                style={{
                  fontSize: '0.6875rem',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--border-subtle)',
                  background: isActive ? 'var(--accent-dim)' : 'transparent',
                  color: isActive ? 'var(--accent-text)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontWeight: isActive ? 500 : 400,
                }}
              >
                {label}
              </button>
            )
          })}
          <button
            onClick={handleReset}
            aria-label="Reset filters"
            style={{
              fontSize: '0.6875rem',
              padding: '2px 6px',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              marginLeft: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <RotateCcw size={10} />
            Reset
          </button>
        </div>
      </div>

      {/* Diff list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {showNoVarsMessage ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No variables found in{' '}
              <code style={{ fontFamily: 'var(--font-mono)' }}>
                {envDisplayName(leftEmpty ? leftSuffix : rightSuffix)}
              </code>
            </p>
          </div>
        ) : showInSyncMessage ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              These environments are in sync. All {diffResult.unchangedCount} keys are identical.
            </p>
          </div>
        ) : noSearchResults ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No results for &ldquo;{searchQuery}&rdquo;
            </p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No differences to show with current filters.
            </p>
          </div>
        ) : (
          <ul
            role="list"
            style={{ listStyle: 'none', margin: 0, padding: 0 }}
          >
            {filteredEntries.map((entry) => (
              <DiffRow
                key={entry.key}
                entry={entry}
                revealAll={revealAll}
                targetSuffix={rightSuffix}
                onPushSingle={handlePushSingle}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
