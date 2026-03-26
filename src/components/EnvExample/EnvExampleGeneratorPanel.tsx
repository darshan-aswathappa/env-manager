import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { X, Copy, Check, FileCode, Wand2 } from 'lucide-react'
import type { Project } from '../../types'
import { generateEnvExampleContent } from '../../lib/envFormats'
import type { EnvExampleAnnotation } from '../../lib/envFormats'

interface EnvExampleGeneratorPanelProps {
  project: Project
  onClose: () => void
}

/** Type-aware smart placeholder for a given key name. */
function smartPlaceholder(key: string): string {
  const k = key.toUpperCase()
  if (k.includes('URL') || k.includes('HOST') || k.includes('ENDPOINT')) return 'http://localhost:3000'
  if (k.includes('PORT')) return '3000'
  if (k.includes('DATABASE') || k.includes('DB_URL') || k.includes('DSN')) return 'postgres://localhost/mydb'
  if (k.includes('DEBUG') || k.includes('ENABLED') || k.includes('FLAG')) return 'false'
  if (k.includes('ENV') || k.includes('ENVIRONMENT') || k.includes('NODE_ENV')) return 'development'
  return ''
}

export default function EnvExampleGeneratorPanel({
  project,
  onClose,
}: EnvExampleGeneratorPanelProps) {
  const [annotations, setAnnotations] = useState<Map<string, EnvExampleAnnotation>>(() => {
    const initial = new Map<string, EnvExampleAnnotation>()
    for (const v of project.vars) {
      if (v.key.trim()) {
        initial.set(v.key, { placeholder: '', note: v.comment ?? '', required: true })
      }
    }
    return initial
  })

  const [copied, setCopied] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const activeVars = useMemo(
    () => project.vars.filter(v => v.key.trim()),
    [project.vars]
  )

  const previewContent = useMemo(
    () => generateEnvExampleContent(activeVars, annotations),
    [activeVars, annotations]
  )

  function updateAnnotation(key: string, field: keyof EnvExampleAnnotation, value: string | boolean) {
    setAnnotations(prev => {
      const next = new Map(prev)
      const existing = next.get(key) ?? { placeholder: '', note: '', required: true }
      next.set(key, { ...existing, [field]: value })
      return next
    })
  }

  function handleSmartFill() {
    setAnnotations(prev => {
      const next = new Map(prev)
      for (const v of activeVars) {
        const existing = next.get(v.key) ?? { placeholder: '', note: '', required: true }
        if (!existing.placeholder) {
          const suggestion = smartPlaceholder(v.key)
          if (suggestion) next.set(v.key, { ...existing, placeholder: suggestion })
        }
      }
      return next
    })
  }

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(previewContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }, [previewContent])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [onClose])

  return (
    <div
      ref={panelRef}
      data-testid="example-generator-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Generate .env.example"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 560,
        maxWidth: '100vw',
        background: 'var(--bg-sidebar)',
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileCode size={15} style={{ color: 'var(--text-tertiary)' }} aria-hidden="true" />
          <h2 style={{
            margin: 0,
            fontSize: '0.9375rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            Export as .env.example
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={handleSmartFill}
            aria-label="Smart fill placeholders"
            title="Auto-fill empty placeholders based on key name conventions"
            style={{
              background: 'none',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              borderRadius: 'var(--radius-xl, 999px)',
              padding: '3px 10px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Wand2 size={12} />
            Smart fill
          </button>
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
      </div>

      {/* Description */}
      <p style={{
        margin: 0,
        padding: '10px 16px 0',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
        flexShrink: 0,
      }}>
        Set a placeholder and note per variable. Uncheck <strong>Req</strong> to mark as optional. Secret values are never included.
      </p>

      {/* Variable annotation list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}>
        {activeVars.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '0.8125rem',
            padding: '24px 0',
          }}>
            No variables to export.
          </div>
        )}

        {/* Column headers */}
        {activeVars.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 36px',
            gap: 8,
            padding: '4px 0 6px',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: 4,
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Key
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Placeholder
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
              Note (comment)
            </span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-tertiary)', textTransform: 'uppercase', textAlign: 'center' }}>
              Req
            </span>
          </div>
        )}

        {activeVars.map(v => {
          const ann = annotations.get(v.key) ?? { placeholder: '', note: '', required: true }
          return (
            <div
              key={v.id}
              data-testid={`row-${v.key}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 36px',
                gap: 8,
                alignItems: 'center',
                padding: '4px 0',
                opacity: ann.required ? 1 : 0.75,
              }}
            >
              {/* Key (read-only) */}
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8125rem',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {v.key}
              </span>

              {/* Placeholder input */}
              <input
                type="text"
                value={ann.placeholder}
                onChange={e => updateAnnotation(v.key, 'placeholder', e.target.value)}
                placeholder="placeholder…"
                aria-label={`Placeholder for ${v.key}`}
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  borderRadius: 4,
                  padding: '3px 7px',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  width: '100%',
                  outline: 'none',
                }}
              />

              {/* Note input */}
              <input
                type="text"
                value={ann.note}
                onChange={e => updateAnnotation(v.key, 'note', e.target.value)}
                placeholder="note…"
                aria-label={`Note for ${v.key}`}
                style={{
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  borderRadius: 4,
                  padding: '3px 7px',
                  fontSize: '0.75rem',
                  width: '100%',
                  outline: 'none',
                }}
              />

              {/* Required checkbox */}
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  type="checkbox"
                  checked={ann.required}
                  onChange={e => updateAnnotation(v.key, 'required', e.target.checked)}
                  aria-label={`${v.key} is required`}
                  style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Preview */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '10px 16px 12px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxHeight: 220,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'var(--text-tertiary)',
            textTransform: 'uppercase',
          }}>
            Preview — .env.example
          </span>
          <button
            onClick={handleCopy}
            aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
            style={{
              background: copied ? 'transparent' : 'var(--accent)',
              border: copied ? '1px solid var(--border-subtle)' : 'none',
              color: copied ? 'var(--color-success, #22c55e)' : '#fff',
              borderRadius: 'var(--radius-xl, 999px)',
              padding: '4px 12px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontWeight: 500,
              transition: 'all var(--t-fast)',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <pre
          data-testid="example-preview"
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: '8px 10px',
            overflowY: 'auto',
            flex: 1,
            whiteSpace: 'pre',
            maxHeight: 160,
          }}
        >
          {previewContent || <span style={{ color: 'var(--text-tertiary)' }}>— empty —</span>}
        </pre>
      </div>
    </div>
  )
}
