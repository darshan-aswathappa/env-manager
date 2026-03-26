import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Project, EnvVar } from '../types'
import EnvExampleGeneratorPanel from '../components/EnvExample/EnvExampleGeneratorPanel'

// ── Fixtures ───────────────────────────────────────────────────────────────

function makeVar(key: string, val = '', comment?: string): EnvVar {
  return { id: `id-${key}`, key, val, revealed: false, sourceProjectId: 'p1', comment }
}

const mockProject: Project = {
  id: 'p1',
  name: 'MyProject',
  path: '/my/project',
  parentId: null,
  vars: [makeVar('DATABASE_URL', 'postgres://secret'), makeVar('API_KEY', 'sk-secret'), makeVar('PORT', '3000')],
  environments: [{ suffix: '', vars: [] }],
  activeEnv: '',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
}

// ── Phase 5: EnvExampleGeneratorPanel ─────────────────────────────────────

describe('EnvExampleGeneratorPanel – rendering', () => {
  let onClose: Mock<() => void>

  beforeEach(() => {
    onClose = vi.fn<() => void>()
  })

  it('5.1: renders panel with project var keys', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    expect(screen.getByText('DATABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
    expect(screen.getByText('PORT')).toBeInTheDocument()
  })

  it('5.2: renders a heading identifying the generator', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    expect(screen.getByText(/export as .env.example|generate .env.example/i)).toBeInTheDocument()
  })

  it('5.3: close button calls onClose', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('5.4: each var has a placeholder input field', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    // 3 vars → 3 placeholder inputs (one per var)
    const placeholderInputs = screen.getAllByPlaceholderText(/placeholder/i)
    expect(placeholderInputs.length).toBeGreaterThanOrEqual(3)
  })

  it('5.5: each var has a note/comment input field', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const noteInputs = screen.getAllByPlaceholderText(/note|comment/i)
    expect(noteInputs.length).toBeGreaterThanOrEqual(3)
  })

  it('5.6: val is never shown in any input (privacy)', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    // Secret values should not appear anywhere in the rendered output
    expect(screen.queryByDisplayValue('postgres://secret')).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('sk-secret')).not.toBeInTheDocument()
  })

  it('5.7: var with existing EnvVar.comment pre-fills note field', () => {
    const projectWithComment: Project = {
      ...mockProject,
      vars: [makeVar('SECRET', 'val', 'rotate monthly')],
      environments: [{ suffix: '', vars: [makeVar('SECRET', 'val', 'rotate monthly')] }],
    }
    render(<EnvExampleGeneratorPanel project={projectWithComment} onClose={onClose} />)
    expect(screen.getByDisplayValue('rotate monthly')).toBeInTheDocument()
  })

  it('5.8: generated preview section is visible', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    // Preview heading or preview area
    const preview = screen.getByTestId('example-preview')
    expect(preview).toBeInTheDocument()
  })

  it('5.9: initial preview shows all keys with empty values', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const preview = screen.getByTestId('example-preview')
    expect(preview.textContent).toContain('DATABASE_URL=')
    expect(preview.textContent).toContain('API_KEY=')
    expect(preview.textContent).toContain('PORT=')
  })
})

describe('EnvExampleGeneratorPanel – interactions', () => {
  let onClose: Mock<() => void>

  beforeEach(() => {
    onClose = vi.fn<() => void>()
  })

  it('5.10: editing placeholder updates preview live', async () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const placeholderInputs = screen.getAllByPlaceholderText(/placeholder/i)
    // Edit the first var's placeholder (DATABASE_URL)
    fireEvent.change(placeholderInputs[0], { target: { value: 'postgres://localhost/mydb' } })
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('DATABASE_URL=postgres://localhost/mydb')
    })
  })

  it('5.11: editing note updates preview live with inline comment', async () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const noteInputs = screen.getAllByPlaceholderText(/note|comment/i)
    fireEvent.change(noteInputs[0], { target: { value: 'get from Supabase' } })
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('# get from Supabase')
    })
  })

  it('5.12: copy button copies preview content to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const copyBtn = screen.getByRole('button', { name: /copy/i })
    fireEvent.click(copyBtn)
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1)
      const copiedContent = writeText.mock.calls[0][0] as string
      expect(copiedContent).toContain('DATABASE_URL=')
      expect(copiedContent).toContain('API_KEY=')
    })
  })

  it('5.13: copy shows visual feedback after click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const copyBtn = screen.getByRole('button', { name: /copy/i })
    fireEvent.click(copyBtn)
    await waitFor(() => {
      // Button text changes to "Copied" or check icon appears
      const copied = screen.queryByRole('button', { name: /copied/i }) ??
        screen.queryByText(/copied/i)
      expect(copied).toBeInTheDocument()
    })
  })

  it('5.14: project with zero vars renders gracefully without crash', () => {
    const emptyProject: Project = { ...mockProject, vars: [] }
    expect(() =>
      render(<EnvExampleGeneratorPanel project={emptyProject} onClose={onClose} />)
    ).not.toThrow()
  })

  it('5.15: preview omits vars with empty keys', () => {
    const projectWithEmpty: Project = {
      ...mockProject,
      vars: [makeVar(''), makeVar('VALID')],
    }
    render(<EnvExampleGeneratorPanel project={projectWithEmpty} onClose={onClose} />)
    const preview = screen.getByTestId('example-preview')
    // Preview should only show VALID= not an empty-key line
    const lines = preview.textContent?.split('\n').filter(Boolean) ?? []
    expect(lines.every(l => !l.startsWith('='))).toBe(true)
  })
})

describe('EnvExampleGeneratorPanel – required/optional and smart fill', () => {
  let onClose: Mock<() => void>

  beforeEach(() => {
    onClose = vi.fn<() => void>()
  })

  it('5.19: each var has a "required" checkbox, checked by default', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes.length).toBeGreaterThanOrEqual(3)
    checkboxes.forEach(cb => expect(cb).toBeChecked())
  })

  it('5.20: unchecking required checkbox adds "optional" marker to preview', async () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // uncheck first var's required
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('optional')
    })
  })

  it('5.21: "Smart fill" button exists in header', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    expect(screen.getByRole('button', { name: /smart fill/i })).toBeInTheDocument()
  })

  it('5.22: "Smart fill" fills empty PORT placeholder with 3000', async () => {
    const projectWithPort: Project = {
      ...mockProject,
      vars: [makeVar('PORT', '')],
    }
    render(<EnvExampleGeneratorPanel project={projectWithPort} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('3000')
    })
  })

  it('5.23: "Smart fill" does not overwrite already-filled placeholder', async () => {
    const projectWithURL: Project = {
      ...mockProject,
      vars: [makeVar('DATABASE_URL', '')],
    }
    render(<EnvExampleGeneratorPanel project={projectWithURL} onClose={onClose} />)
    // Manually fill first
    const inputs = screen.getAllByPlaceholderText(/placeholder/i)
    fireEvent.change(inputs[0], { target: { value: 'my-custom-url' } })
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      expect(screen.getByDisplayValue('my-custom-url')).toBeInTheDocument()
    })
  })
}) // end: required/optional and smart fill

describe('EnvExampleGeneratorPanel – smartPlaceholder branches & keyboard', () => {
  let onClose: Mock<() => void>

  beforeEach(() => {
    onClose = vi.fn<() => void>()
  })

  it('5.24: smart fill fills DATABASE key (no URL) with postgres placeholder', async () => {
    const project: Project = {
      ...mockProject,
      vars: [makeVar('DATABASE_NAME', '')],
    }
    render(<EnvExampleGeneratorPanel project={project} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('postgres://localhost/mydb')
    })
  })

  it('5.25: smart fill fills DEBUG key with "false"', async () => {
    const project: Project = {
      ...mockProject,
      vars: [makeVar('DEBUG', '')],
    }
    render(<EnvExampleGeneratorPanel project={project} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('false')
    })
  })

  it('5.26: smart fill fills FEATURE_ENABLED key with "false"', async () => {
    const project: Project = {
      ...mockProject,
      vars: [makeVar('FEATURE_ENABLED', '')],
    }
    render(<EnvExampleGeneratorPanel project={project} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('false')
    })
  })

  it('5.27: smart fill fills NODE_ENV key with "development"', async () => {
    const project: Project = {
      ...mockProject,
      vars: [makeVar('NODE_ENV', '')],
    }
    render(<EnvExampleGeneratorPanel project={project} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      const preview = screen.getByTestId('example-preview')
      expect(preview.textContent).toContain('development')
    })
  })

  it('5.28: smart fill leaves unknown key placeholder empty (no suggestion)', async () => {
    const project: Project = {
      ...mockProject,
      vars: [makeVar('RANDOM_SETTING', '')],
    }
    render(<EnvExampleGeneratorPanel project={project} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /smart fill/i }))
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/placeholder/i)
      expect(input).toHaveValue('')
    })
  })

  it('5.29: pressing Escape calls onClose', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const panel = screen.getByTestId('example-generator-panel')
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('5.30: pressing non-Escape key does not call onClose', () => {
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const panel = screen.getByTestId('example-generator-panel')
    fireEvent.keyDown(panel, { key: 'Enter' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('5.31: copy handles clipboard failure gracefully', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('not allowed')) },
    })
    render(<EnvExampleGeneratorPanel project={mockProject} onClose={onClose} />)
    const copyBtn = screen.getByRole('button', { name: /copy/i })
    // Should not throw even when clipboard rejects
    await expect(async () => {
      fireEvent.click(copyBtn)
      await new Promise(r => setTimeout(r, 50))
    }).not.toThrow()
  })
})

// Note: "Generate .env.example" was moved from VarList toolbar to the Sidebar
// overflow menu (alongside "Import .env.example"). Tests for that action are
// in src/test/Sidebar.test.tsx.
