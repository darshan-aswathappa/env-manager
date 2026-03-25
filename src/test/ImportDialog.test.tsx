import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { open } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@tauri-apps/plugin-fs'
import ImportDialog from '../components/Import/ImportDialog'
import type { Project } from '../types'

const mockOpen = vi.mocked(open)
const mockReadTextFile = vi.mocked(readTextFile)

const existingVar = { id: 'v1', key: 'EXISTING', val: 'existing-val', revealed: false, sourceProjectId: 'p1' }

const baseProject: Project = {
  id: 'p1',
  name: 'Test',
  path: '/test',
  parentId: null,
  vars: [existingVar],
  environments: [{ suffix: '', vars: [existingVar] }],
  activeEnv: '',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
}

const emptyProject: Project = {
  ...baseProject,
  vars: [],
  environments: [{ suffix: '', vars: [] }],
}

describe('ImportDialog', () => {
  beforeEach(() => {
    mockOpen.mockReset()
    mockReadTextFile.mockReset()
  })

  // ── Step 1 (pick) ──────────────────────────────────────────────────────

  it('renders step 1 file picker on initial render', () => {
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/Choose File/i)).toBeInTheDocument()
  })

  it('Cancel button calls onClose', () => {
    const onClose = vi.fn()
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not render preview table in step 1', () => {
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByText(/Incoming Value/i)).not.toBeInTheDocument()
  })

  it('does nothing when file picker is cancelled (open returns null)', async () => {
    mockOpen.mockResolvedValue(null)
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled()
    })
    // Still on step 1
    expect(screen.getByText(/Choose File/i)).toBeInTheDocument()
  })

  // ── Step 2 (preview) ────────────────────────────────────────────────────

  it('advances to step 2 after file selection', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('NEW_KEY=new-value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText(/Detected:/i)).toBeInTheDocument()
    })
  })

  it('shows all parsed vars as rows in the preview table', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('KEY1=val1\nKEY2=val2')
    render(<ImportDialog project={emptyProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText('KEY1')).toBeInTheDocument()
      expect(screen.getByText('KEY2')).toBeInTheDocument()
    })
  })

  it('shows New badge for keys not in existing env', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('BRAND_NEW=value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText('New')).toBeInTheDocument()
    })
  })

  it('shows Conflict badge for keys that exist with different values', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('EXISTING=different-value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText('Conflict')).toBeInTheDocument()
    })
  })

  it('shows Same badge for keys with identical values', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('EXISTING=existing-val')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText('Same')).toBeInTheDocument()
    })
  })

  it('values are masked by default in preview (shows ••••••)', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('SECRET=my-secret-value')
    render(<ImportDialog project={emptyProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.queryByText('my-secret-value')).not.toBeInTheDocument()
      expect(screen.getAllByText('••••••').length).toBeGreaterThan(0)
    })
  })

  it('Reveal values toggle unmasks all values in preview', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('SECRET=my-secret-value')
    render(<ImportDialog project={emptyProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByLabelText(/Reveal values/i)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByLabelText(/Reveal values/i))
    expect(screen.getByText('my-secret-value')).toBeInTheDocument()
  })

  it('displays error message in step 2 when parsing throws FormatParseError', async () => {
    mockOpen.mockResolvedValue('/path/to/vars.json')
    mockReadTextFile.mockResolvedValue('{invalid json')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON/i)).toBeInTheDocument()
    })
  })

  it('shows detected format as a badge', async () => {
    mockOpen.mockResolvedValue('/path/to/vars.json')
    mockReadTextFile.mockResolvedValue('{"KEY": "val"}')
    render(<ImportDialog project={emptyProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByText(/Detected:.*json/i)).toBeInTheDocument()
    })
  })

  // ── Step 3 (conflicts) ──────────────────────────────────────────────────

  it('skips conflict step when there are no conflicting keys', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('BRAND_NEW=value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      // Import button directly visible — no Next button
      expect(screen.getByRole('button', { name: /^Import/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Next/i })).not.toBeInTheDocument()
    })
  })

  it('shows Next button and conflict step when conflicts exist', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('EXISTING=different-value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Next/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Overwrite All/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Skip All/i })).toBeInTheDocument()
    })
  })

  it('Overwrite All sets all keys to overwrite', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('EXISTING=different-value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => screen.getByRole('button', { name: /^Next/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }))
    await waitFor(() => screen.getByRole('button', { name: /Overwrite All/i }))
    fireEvent.click(screen.getByRole('button', { name: /Overwrite All/i }))
    // Import button count should reflect the overwrite decision
    expect(screen.getByRole('button', { name: /Import 1/i })).toBeInTheDocument()
  })

  it('Skip All sets all keys to skip', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('EXISTING=different-value')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => screen.getByRole('button', { name: /^Next/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Next/i }))
    await waitFor(() => screen.getByRole('button', { name: /Skip All/i }))
    fireEvent.click(screen.getByRole('button', { name: /Skip All/i }))
    // Import button count should be 0 when all are skipped
    expect(screen.getByRole('button', { name: /Import 0/i })).toBeInTheDocument()
  })

  // ── Commit ──────────────────────────────────────────────────────────────

  it('Import button calls onImportComplete with merged vars', async () => {
    const onImportComplete = vi.fn()
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('NEW_KEY=new-val')
    render(
      <ImportDialog
        project={baseProject}
        onImportComplete={onImportComplete}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => screen.getByRole('button', { name: /^Import/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Import/i }))
    await waitFor(() => {
      expect(onImportComplete).toHaveBeenCalled()
      const merged: { key: string; val: string }[] = onImportComplete.mock.calls[0][0]
      expect(merged.some(v => v.key === 'NEW_KEY' && v.val === 'new-val')).toBe(true)
      expect(merged.some(v => v.key === 'EXISTING')).toBe(true)
    })
  })

  // ── Step 4 (done) ──────────────────────────────────────────────────────

  it('shows success message with import counts after commit', async () => {
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('NEW_KEY=new-val')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => screen.getByRole('button', { name: /^Import/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Import/i }))
    await waitFor(() => {
      expect(screen.getByText(/Imported/i)).toBeInTheDocument()
    })
  })

  it('Done button in step 4 calls onClose', async () => {
    const onClose = vi.fn()
    mockOpen.mockResolvedValue('/path/to/.env')
    mockReadTextFile.mockResolvedValue('NEW_KEY=new-val')
    render(<ImportDialog project={baseProject} onImportComplete={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByText(/Choose File/i))
    await waitFor(() => screen.getByRole('button', { name: /^Import/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Import/i }))
    await waitFor(() => screen.getByRole('button', { name: /^Done/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Done/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
