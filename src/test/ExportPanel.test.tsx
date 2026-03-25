import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import ExportPanel from '../components/Export/ExportPanel'
import type { Project } from '../types'

const mockInvoke = vi.mocked(invoke)
const mockSave = vi.mocked(save)

const testVars = [
  { id: 'v1', key: 'API_KEY', val: 'secret-key', revealed: false, sourceProjectId: 'p1' },
  { id: 'v2', key: 'PORT', val: '3000', revealed: false, sourceProjectId: 'p1' },
]

const prodVars = [
  { id: 'v3', key: 'API_KEY', val: 'prod-key', revealed: false, sourceProjectId: 'p1' },
]

const baseProject: Project = {
  id: 'p1',
  name: 'Test',
  path: '/test',
  parentId: null,
  vars: testVars,
  environments: [
    { suffix: '', vars: testVars },
    { suffix: 'production', vars: prodVars },
  ],
  activeEnv: '',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
}

describe('ExportPanel', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockSave.mockReset()
    mockInvoke.mockResolvedValue(null)
  })

  // ── Rendering ──────────────────────────────────────────────────────────

  it('renders with ENV as default active format', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /^ENV$/i })).toBeInTheDocument()
  })

  it('renders scope selector with Active environment as default', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    const activeRadio = screen.getByRole('radio', { name: /Active environment/i })
    expect(activeRadio).toBeChecked()
  })

  it('preview pane is not empty on initial render', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent?.trim().length).toBeGreaterThan(0)
  })

  it('close button calls onClose', () => {
    const onClose = vi.fn()
    render(<ExportPanel project={baseProject} onClose={onClose} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalled()
  })

  // ── Format selector ─────────────────────────────────────────────────────

  it('switching format to JSON updates preview to JSON structure', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^JSON$/i }))
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent).toContain('{')
    expect(preview.textContent).toContain('}')
  })

  it('switching format to YAML updates preview to YAML format', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^YAML$/i }))
    const preview = screen.getByTestId('export-preview')
    // YAML format has key: value pairs
    expect(preview.textContent).toContain('API_KEY:')
  })

  it('switching format to CSV updates preview with header row', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^CSV$/i }))
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent?.toLowerCase()).toContain('key')
  })

  it('switching format to Shell updates preview with export prefixes', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^Shell$/i }))
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent).toContain('export ')
  })

  it('switching back to ENV restores dotenv format', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /^JSON$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^ENV$/i }))
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent).toContain('API_KEY=')
  })

  // ── Scope selector ──────────────────────────────────────────────────────

  it('selecting All environments shows ZIP note', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /All environments/i }))
    expect(screen.getByText(/\.zip/i)).toBeInTheDocument()
  })

  it('selecting All environments changes Save button to Save ZIP Archive', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /All environments/i }))
    expect(screen.getByRole('button', { name: /Save ZIP Archive/i })).toBeInTheDocument()
  })

  it('Active environment only shows Save File button', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Save File/i })).toBeInTheDocument()
  })

  // ── Value masking ────────────────────────────────────────────────────────

  it('values are masked by default in preview pane', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent).toContain('••••••')
    expect(preview.textContent).not.toContain('secret-key')
  })

  it('Show values toggle reveals real values in preview pane', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Show values/i))
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent).toContain('secret-key')
    expect(preview.textContent).not.toContain('••••••')
  })

  it('toggling Show values off re-masks the preview', () => {
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByLabelText(/Show values/i))
    fireEvent.click(screen.getByLabelText(/Show values/i))
    const preview = screen.getByTestId('export-preview')
    expect(preview.textContent).toContain('••••••')
    expect(preview.textContent).not.toContain('secret-key')
  })

  // ── Save flow — single env ───────────────────────────────────────────────

  it('Save File triggers OS save dialog', async () => {
    mockSave.mockResolvedValue('/chosen/path/.env')
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Save File/i }))
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalled()
    })
  })

  it('Save File calls write_text_to_path with correct path after dialog', async () => {
    mockSave.mockResolvedValue('/chosen/path/.env')
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Save File/i }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'write_text_to_path',
        expect.objectContaining({ path: '/chosen/path/.env' })
      )
    })
  })

  it('calls onSaveComplete after successful single-env save', async () => {
    const onSaveComplete = vi.fn()
    mockSave.mockResolvedValue('/chosen/path/.env')
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={onSaveComplete} />)
    fireEvent.click(screen.getByRole('button', { name: /Save File/i }))
    await waitFor(() => {
      expect(onSaveComplete).toHaveBeenCalled()
    })
  })

  it('does not call write_text_to_path when save dialog is cancelled', async () => {
    mockSave.mockResolvedValue(null)
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Save File/i }))
    await waitFor(() => expect(mockSave).toHaveBeenCalled())
    expect(mockInvoke).not.toHaveBeenCalledWith('write_text_to_path', expect.anything())
  })

  // ── Save flow — ZIP ──────────────────────────────────────────────────────

  it('Save ZIP Archive calls export_envs_to_zip invoke', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'export_envs_to_zip') return Promise.resolve(new Uint8Array([1, 2, 3]))
      return Promise.resolve(null)
    })
    mockSave.mockResolvedValue('/chosen/path/archive.zip')
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /All environments/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save ZIP Archive/i }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('export_envs_to_zip', expect.anything())
    })
  })

  it('Save ZIP Archive calls write_bytes_to_path after export_envs_to_zip', async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'export_envs_to_zip') return Promise.resolve(new Uint8Array([1, 2, 3]))
      return Promise.resolve(null)
    })
    mockSave.mockResolvedValue('/chosen/path/archive.zip')
    render(<ExportPanel project={baseProject} onClose={vi.fn()} onSaveComplete={vi.fn()} />)
    fireEvent.click(screen.getByRole('radio', { name: /All environments/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save ZIP Archive/i }))
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'write_bytes_to_path',
        expect.objectContaining({ path: '/chosen/path/archive.zip' })
      )
    })
  })

  it('calls onSaveComplete after successful ZIP save', async () => {
    const onSaveComplete = vi.fn()
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === 'export_envs_to_zip') return Promise.resolve(new Uint8Array([1, 2, 3]))
      return Promise.resolve(null)
    })
    mockSave.mockResolvedValue('/chosen/path/archive.zip')
    render(<ExportPanel project={baseProject} onClose={onSaveComplete} onSaveComplete={onSaveComplete} />)
    fireEvent.click(screen.getByRole('radio', { name: /All environments/i }))
    fireEvent.click(screen.getByRole('button', { name: /Save ZIP Archive/i }))
    await waitFor(() => {
      expect(onSaveComplete).toHaveBeenCalled()
    })
  })
})
