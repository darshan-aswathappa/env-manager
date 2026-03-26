import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { X } from 'lucide-react'
import type { Project, ExportFormat, ExportScope, EnvVar } from '../../types'
import { serializeByFormat } from '../../lib/envFormats'

// ── Props ─────────────────────────────────────────────────────────────────

export interface ExportPanelProps {
  project: Project
  onClose: () => void
  onSaveComplete: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────

const FORMATS: ExportFormat[] = ['env', 'json', 'yaml', 'csv', 'shell']
const FORMAT_LABELS: Record<ExportFormat, string> = {
  env: 'ENV', json: 'JSON', yaml: 'YAML', csv: 'CSV', shell: 'Shell',
}
const FORMAT_EXTENSIONS: Record<ExportFormat, string> = {
  env: 'env', json: 'json', yaml: 'yaml', csv: 'csv', shell: 'sh',
}

const MASK = '••••••'

function maskVars(vars: EnvVar[]): EnvVar[] {
  return vars.map(v => ({ ...v, val: MASK }))
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ExportPanel({ project, onClose, onSaveComplete }: ExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>('env')
  const [scope, setScope] = useState<ExportScope>('active')
  const [revealValues, setRevealValues] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // ── Preview content ───────────────────────────────────────────────────────
  const previewContent = useMemo(() => {
    const activeVars = project.vars
    const displayVars = revealValues ? activeVars : maskVars(activeVars)
    const { content } = serializeByFormat(displayVars, format)

    if (scope === 'all') {
      // Show first env content with a note about remaining
      const envCount = project.environments.filter(e => e.vars.length > 0).length
      const note = envCount > 1 ? `\n\n# …and ${envCount - 1} more file(s) in the ZIP archive` : ''
      return content + note
    }
    return content
  }, [project.vars, project.environments, format, scope, revealValues])

  // ── Save handlers ─────────────────────────────────────────────────────────

  const handleSaveFile = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const ext = FORMAT_EXTENSIONS[format]
      const defaultName = `.env${ext === 'env' ? '' : `.${ext}`}`
      const path = await save({
        defaultPath: defaultName,
        filters: [{ name: 'Env file', extensions: [ext] }],
      })
      if (!path) {
        setIsSaving(false)
        return
      }
      // Serialize real values (not masked)
      const { content } = serializeByFormat(project.vars, format)
      await invoke('write_file', { path, content })
      onSaveComplete()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save file. Check write permissions.')
    } finally {
      setIsSaving(false)
    }
  }, [format, project.vars, onSaveComplete])

  const handleSaveZip = useCallback(async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      // Build file entries from all environments
      const files = project.environments
        .filter(env => env.vars.length > 0)
        .map(env => {
          const ext = FORMAT_EXTENSIONS[format]
          const filename = env.suffix
            ? `${env.suffix}.${ext}`
            : `.env${ext === 'env' ? '' : `.${ext}`}`
          const { content } = serializeByFormat(env.vars, format)
          return { filename, content }
        })

      const bytes = await invoke<Uint8Array>('export_envs_to_zip', { files })

      const safeName = (project.name || 'envs').replace(/[/\\:*?"<>|]/g, '_')
      const path = await save({
        defaultPath: `${safeName}.zip`,
        filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
      })
      if (!path) {
        setIsSaving(false)
        return
      }

      await invoke('write_bytes_to_path', { path, data: Array.from(bytes) })
      onSaveComplete()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save ZIP. Check write permissions.')
    } finally {
      setIsSaving(false)
    }
  }, [format, project, onSaveComplete])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }, [onClose])

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      data-testid="export-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Export Variables"
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
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border-separator)',
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Export Variables
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            (Cmd+E)
          </div>
        </div>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
          style={{ position: 'relative', top: 'auto', right: 'auto', flexShrink: 0 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Format selector (segmented control) */}
      <div style={{ padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>
          Format
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          {FORMATS.map(fmt => (
            <button
              key={fmt}
              aria-pressed={format === fmt}
              onClick={() => setFormat(fmt)}
              style={{
                flex: 1,
                padding: '4px 0',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                fontSize: '0.75rem',
                fontWeight: 500,
                cursor: 'pointer',
                background: format === fmt ? 'var(--bg-sidebar)' : 'transparent',
                color: format === fmt ? 'var(--text-primary)' : 'var(--text-tertiary)',
                border: 'none',
                transition: 'all var(--t-fast)',
              }}
            >
              {FORMAT_LABELS[fmt]}
            </button>
          ))}
        </div>
      </div>

      {/* Scope selector */}
      <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, fontWeight: 500 }}>
          Scope
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 6 }}>
          <input
            type="radio"
            name="export-scope"
            value="active"
            checked={scope === 'active'}
            onChange={() => setScope('active')}
            aria-label="Active environment only"
            style={{ accentColor: 'var(--accent)' }}
          />
          Active environment only
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="radio"
            name="export-scope"
            value="all"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
            aria-label="All environments (ZIP)"
            style={{ accentColor: 'var(--accent)' }}
          />
          All environments (ZIP)
        </label>
        {scope === 'all' && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: 6, marginLeft: 24 }}>
            A <code>.zip</code> file containing one file per environment.
          </p>
        )}
      </div>

      {/* Reveal toggle */}
      <div style={{ padding: '0 16px 8px', flexShrink: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            aria-label="Show values in preview"
            checked={revealValues}
            onChange={e => setRevealValues(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Show values in preview
        </label>
      </div>

      {/* Preview pane */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', minHeight: 0 }}>
        <pre
          data-testid="export-preview"
          role="region"
          aria-label="Export preview"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8125rem',
            color: 'var(--text-secondary)',
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 14px',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            minHeight: 80,
          }}
        >
          {previewContent || 'No variables to export'}
        </pre>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border-separator)',
        padding: '12px 16px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}>
        {saveError && (
          <p
            role="alert"
            style={{
              fontSize: '0.75rem',
              color: 'var(--color-danger)',
              background: 'var(--color-danger-bg)',
              border: '1px solid rgba(229,72,77,0.2)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 10px',
              margin: 0,
              wordBreak: 'break-word',
            }}
          >
            {saveError}
          </p>
        )}
        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: 0 }}>
          Saved files contain real values regardless of preview masking.
        </p>
        <button
          className="btn-primary"
          onClick={scope === 'all' ? handleSaveZip : handleSaveFile}
          disabled={isSaving}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {isSaving ? 'Saving…' : scope === 'all' ? 'Save ZIP Archive' : 'Save File'}
        </button>
      </div>
    </div>
  )
}
