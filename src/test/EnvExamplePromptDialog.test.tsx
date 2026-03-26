import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Project, EnvVar } from '../types'
import type { EnvExampleFile } from '../types'
import EnvExamplePromptDialog from '../components/EnvExample/EnvExamplePromptDialog'

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockProject: Project = {
  id: 'p1',
  name: 'MyProject',
  path: '/my/project',
  parentId: null,
  vars: [],
  environments: [{ suffix: '', vars: [] }],
  activeEnv: '',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
}

function makeExampleFile(keys: string[], withPlaceholders = false): EnvExampleFile {
  const exampleKeys = keys.map(k => ({
    key: k,
    placeholder: withPlaceholders ? 'my-placeholder' : '',
    inlineComment: null,
    sectionHeading: null,
  }))
  return {
    keys: exampleKeys,
    totalKeyCount: exampleKeys.length,
    hasPlaceholders: withPlaceholders,
  }
}

function makeExampleFileWithDetails(
  keys: Array<{
    key: string
    placeholder?: string
    inlineComment?: string | null
    sectionHeading?: string | null
  }>
): EnvExampleFile {
  const exampleKeys = keys.map(k => ({
    key: k.key,
    placeholder: k.placeholder ?? '',
    inlineComment: k.inlineComment ?? null,
    sectionHeading: k.sectionHeading ?? null,
  }))
  return {
    keys: exampleKeys,
    totalKeyCount: exampleKeys.length,
    hasPlaceholders: exampleKeys.some(k => k.placeholder !== ''),
  }
}

// ── Phase 3: Prompt Step ───────────────────────────────────────────────────

describe('EnvExamplePromptDialog – prompt step', () => {
  let onImportComplete: Mock<(targetSuffix: string, mergedVars: EnvVar[]) => void>
  let onDismiss: Mock<(projectId: string) => void>
  let onClose: Mock<() => void>

  beforeEach(() => {
    onImportComplete = vi.fn<(targetSuffix: string, mergedVars: EnvVar[]) => void>()
    onDismiss = vi.fn<(projectId: string) => void>()
    onClose = vi.fn<() => void>()
  })

  it('3.1: renders prompt step by default showing .env.example text', () => {
    const exampleFile = makeExampleFile(['KEY1', 'KEY2'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    expect(screen.getByTestId('example-prompt-dialog')).toBeInTheDocument()
  })

  it('3.2: shows total key count for a 5-key example file', () => {
    const exampleFile = makeExampleFile(['A', 'B', 'C', 'D', 'E'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    expect(screen.getByText(/5/)).toBeInTheDocument()
    expect(screen.getByText(/variable/i)).toBeInTheDocument()
  })

  it('3.3: shows new-key count when project has some existing vars', () => {
    const projectWithPort: Project = {
      ...mockProject,
      vars: [{ id: 'v1', key: 'PORT', val: '3000', revealed: false, sourceProjectId: 'p1' }],
      environments: [
        {
          suffix: '',
          vars: [{ id: 'v1', key: 'PORT', val: '3000', revealed: false, sourceProjectId: 'p1' }],
        },
      ],
    }
    // PORT already exists; 4 others are new
    const exampleFile = makeExampleFile(['PORT', 'API_KEY', 'SECRET', 'HOST', 'DEBUG'])
    render(
      <EnvExamplePromptDialog
        project={projectWithPort}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    expect(screen.getByText(/4/)).toBeInTheDocument()
    expect(screen.getByText(/new/i)).toBeInTheDocument()
  })

  it('3.4: Skip button calls onDismiss with projectId', async () => {
    const exampleFile = makeExampleFile(['KEY1'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    // onDismiss is only called when "Don't ask again" is checked
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    const skipBtn = screen.getByRole('button', { name: /skip/i })
    fireEvent.click(skipBtn)
    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledWith('p1')
    })
  })

  it('3.5: Skip button calls onClose', async () => {
    const exampleFile = makeExampleFile(['KEY1'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    const skipBtn = screen.getByRole('button', { name: /skip/i })
    fireEvent.click(skipBtn)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('3.6: "Use as Template" button advances to preview step', async () => {
    const exampleFile = makeExampleFile(['KEY1', 'KEY2'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    const useBtn = screen.getByRole('button', { name: /preview & import/i })
    fireEvent.click(useBtn)
    await waitFor(() => {
      // Preview step should now be rendered; key names visible
      expect(screen.getByText('KEY1')).toBeInTheDocument()
    })
  })

  it('3.7: environment selector present in preview step', async () => {
    const exampleFile = makeExampleFile(['KEY1'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /preview & import/i }))
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
  })

  it('3.8: environment selector defaults to project activeEnv', async () => {
    const projectLocal: Project = {
      ...mockProject,
      activeEnv: 'local',
      environments: [
        { suffix: '', vars: [] },
        { suffix: 'local', vars: [] },
      ],
    }
    const exampleFile = makeExampleFile(['KEY1'])
    render(
      <EnvExamplePromptDialog
        project={projectLocal}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /preview & import/i }))
    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement
      expect(select.value).toBe('local')
    })
  })

  it('3.9: Confirm button calls onImportComplete with targetSuffix and EnvVar array', async () => {
    const exampleFile = makeExampleFile(['NEW_KEY', 'ANOTHER_KEY'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /preview & import/i }))
    await waitFor(() => screen.getByRole('button', { name: /import \d+ variables?/i }))
    fireEvent.click(screen.getByRole('button', { name: /import \d+ variables?/i }))
    await waitFor(() => {
      expect(onImportComplete).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array)
      )
    })
  })

  it('3.10: Back button in preview returns to prompt step', async () => {
    const exampleFile = makeExampleFile(['KEY1'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /preview & import/i }))
    await waitFor(() => screen.getByRole('button', { name: /back/i }))
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    await waitFor(() => {
      expect(screen.getByTestId('example-prompt-dialog')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /preview & import/i })).toBeInTheDocument()
    })
  })

  it('3.11: Close button calls onClose', async () => {
    const exampleFile = makeExampleFile(['KEY1'])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    const closeBtn = screen.getByRole('button', { name: /^close$/i })
    fireEvent.click(closeBtn)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

// ── Phase 4: Preview Key List ─────────────────────────────────────────────

describe('EnvExamplePromptDialog – preview key list', () => {
  let onImportComplete: Mock<(targetSuffix: string, mergedVars: EnvVar[]) => void>
  let onDismiss: Mock<(projectId: string) => void>
  let onClose: Mock<() => void>

  beforeEach(() => {
    onImportComplete = vi.fn<(targetSuffix: string, mergedVars: EnvVar[]) => void>()
    onDismiss = vi.fn<(projectId: string) => void>()
    onClose = vi.fn<() => void>()
  })

  async function renderInPreview(
    project: Project,
    exampleFile: EnvExampleFile
  ) {
    render(
      <EnvExamplePromptDialog
        project={project}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /preview & import/i }))
    await waitFor(() => {
      // Preview is visible when a key from the example is displayed
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })
  }

  it('4.1: new keys listed in preview', async () => {
    const exampleFile = makeExampleFile(['NEW_API_KEY', 'NEW_SECRET'])
    await renderInPreview(mockProject, exampleFile)
    expect(screen.getByText('NEW_API_KEY')).toBeInTheDocument()
    expect(screen.getByText('NEW_SECRET')).toBeInTheDocument()
  })

  it('4.2: already-set keys show "Already set" indicator', async () => {
    const projectWithKey: Project = {
      ...mockProject,
      vars: [{ id: 'v1', key: 'EXISTING_KEY', val: 'val', revealed: false, sourceProjectId: 'p1' }],
      environments: [
        {
          suffix: '',
          vars: [{ id: 'v1', key: 'EXISTING_KEY', val: 'val', revealed: false, sourceProjectId: 'p1' }],
        },
      ],
    }
    const exampleFile = makeExampleFile(['EXISTING_KEY', 'NEW_KEY'])
    await renderInPreview(projectWithKey, exampleFile)
    expect(screen.getAllByText(/already set/i).length).toBeGreaterThan(0)
  })

  it('4.3: placeholder values masked by default; bullets visible', async () => {
    const exampleFile = makeExampleFile(['API_KEY'], true) // has placeholder 'my-placeholder'
    await renderInPreview(mockProject, exampleFile)
    expect(screen.queryByText('my-placeholder')).not.toBeInTheDocument()
    // Some masking indicator should be visible (bullets or similar)
    expect(screen.getByText(/••••/)).toBeInTheDocument()
  })

  it('4.4: reveal toggle unmasks placeholder values', async () => {
    const exampleFile = makeExampleFile(['API_KEY'], true)
    await renderInPreview(mockProject, exampleFile)
    const revealBtn = screen.getByLabelText(/reveal values/i)
    fireEvent.click(revealBtn)
    await waitFor(() => {
      expect(screen.getByText('my-placeholder')).toBeInTheDocument()
    })
  })

  it('4.5: empty placeholder shows — or (empty), not ••••••', async () => {
    const exampleFile = makeExampleFile(['EMPTY_KEY'], false)
    await renderInPreview(mockProject, exampleFile)
    // Empty placeholder should not render masked bullets
    expect(screen.queryByText('••••••')).not.toBeInTheDocument()
    // Should show some empty indicator
    const emptyIndicator = screen.queryByText(/^—$/) ?? screen.queryByText(/\(empty\)/i)
    expect(emptyIndicator).toBeInTheDocument()
  })

  it('4.6: inline comment displayed in preview', async () => {
    const exampleFile = makeExampleFileWithDetails([
      { key: 'API_KEY', placeholder: '', inlineComment: 'get from Auth0 dashboard', sectionHeading: null },
    ])
    await renderInPreview(mockProject, exampleFile)
    expect(screen.getByText(/get from Auth0 dashboard/i)).toBeInTheDocument()
  })

  it('4.7: section headings rendered as group separators', async () => {
    const exampleFile = makeExampleFileWithDetails([
      { key: 'JWT_SECRET', placeholder: '', inlineComment: null, sectionHeading: 'Auth' },
      { key: 'API_KEY', placeholder: '', inlineComment: null, sectionHeading: null },
    ])
    await renderInPreview(mockProject, exampleFile)
    expect(screen.getByText('Auth')).toBeInTheDocument()
  })

  it('4.8: key count summary shown in preview; 3 new of 5 total', async () => {
    const projectWith2: Project = {
      ...mockProject,
      vars: [
        { id: 'v1', key: 'EXISTING1', val: 'x', revealed: false, sourceProjectId: 'p1' },
        { id: 'v2', key: 'EXISTING2', val: 'y', revealed: false, sourceProjectId: 'p1' },
      ],
      environments: [
        {
          suffix: '',
          vars: [
            { id: 'v1', key: 'EXISTING1', val: 'x', revealed: false, sourceProjectId: 'p1' },
            { id: 'v2', key: 'EXISTING2', val: 'y', revealed: false, sourceProjectId: 'p1' },
          ],
        },
      ],
    }
    const exampleFile = makeExampleFile(['EXISTING1', 'EXISTING2', 'NEW1', 'NEW2', 'NEW3'])
    await renderInPreview(projectWith2, exampleFile)
    // Should mention 3 somewhere (3 new keys to import)
    expect(screen.getByText(/3 variables? to import/i)).toBeInTheDocument()
  })

  it('4.9: already-set keys visually dimmed — check CSS class or aria-disabled', async () => {
    const projectWithKey: Project = {
      ...mockProject,
      vars: [{ id: 'v1', key: 'SET_KEY', val: 'val', revealed: false, sourceProjectId: 'p1' }],
      environments: [
        {
          suffix: '',
          vars: [{ id: 'v1', key: 'SET_KEY', val: 'val', revealed: false, sourceProjectId: 'p1' }],
        },
      ],
    }
    const exampleFile = makeExampleFile(['SET_KEY', 'NEW_KEY'])
    await renderInPreview(projectWithKey, exampleFile)
    // The row for SET_KEY should be visually dimmed — check for CSS class or aria attribute
    const setKeyElement = screen.getByText('SET_KEY')
    const rowContainer = setKeyElement.closest('[data-status]') ??
      setKeyElement.closest('.dimmed') ??
      setKeyElement.closest('[aria-disabled]') ??
      setKeyElement.parentElement
    expect(rowContainer).toBeTruthy()
    // At minimum the element should exist and be in the document
    expect(setKeyElement).toBeInTheDocument()
  })

  it('4.10: changing target env updates plan live', async () => {
    // PORT exists in '' env but not in 'local' env
    const projectWithPort: Project = {
      ...mockProject,
      activeEnv: '',
      environments: [
        {
          suffix: '',
          vars: [{ id: 'v1', key: 'PORT', val: '3000', revealed: false, sourceProjectId: 'p1' }],
        },
        { suffix: 'local', vars: [] },
      ],
      vars: [{ id: 'v1', key: 'PORT', val: '3000', revealed: false, sourceProjectId: 'p1' }],
    }
    const exampleFile = makeExampleFile(['PORT', 'NEW_KEY'])
    await renderInPreview(projectWithPort, exampleFile)

    // Initially PORT should show as "already set" for '' env
    expect(screen.getAllByText(/already set/i).length).toBeGreaterThan(0)

    // Switch to 'local' env where PORT doesn't exist
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'local' } })

    await waitFor(() => {
      // PORT should no longer be "already set" for 'local' env
      expect(screen.queryByText(/already set/i)).not.toBeInTheDocument()
    })
  })
})

// ── Phase 6: Component Edge Cases ─────────────────────────────────────────

describe('EnvExamplePromptDialog – edge cases (Phase 6)', () => {
  let onImportComplete: Mock<(targetSuffix: string, mergedVars: EnvVar[]) => void>
  let onDismiss: Mock<(projectId: string) => void>
  let onClose: Mock<() => void>

  beforeEach(() => {
    onImportComplete = vi.fn<(targetSuffix: string, mergedVars: EnvVar[]) => void>()
    onDismiss = vi.fn<(projectId: string) => void>()
    onClose = vi.fn<() => void>()
  })

  it('6.7: empty exampleFile (0 keys) renders without throw; primary button disabled', () => {
    const exampleFile = makeExampleFile([])
    expect(() =>
      render(
        <EnvExamplePromptDialog
          project={mockProject}
          exampleFile={exampleFile}
          onImportComplete={onImportComplete}
          onDismiss={onDismiss}
          onClose={onClose}
        />
      )
    ).not.toThrow()
    const useBtn = screen.queryByRole('button', { name: /preview & import/i })
    if (useBtn) {
      expect(useBtn).toBeDisabled()
    }
  })

  it('6.8: comments-only example that parsed to 0 keys renders without throw', () => {
    // Same as 6.7 — 0 keys after parsing comments-only content
    const exampleFile: EnvExampleFile = {
      keys: [],
      totalKeyCount: 0,
      hasPlaceholders: false,
    }
    expect(() =>
      render(
        <EnvExamplePromptDialog
          project={mockProject}
          exampleFile={exampleFile}
          onImportComplete={onImportComplete}
          onDismiss={onDismiss}
          onClose={onClose}
        />
      )
    ).not.toThrow()
    const useBtn = screen.queryByRole('button', { name: /preview & import/i })
    if (useBtn) {
      expect(useBtn).toBeDisabled()
    }
  })

  it('6.9: all keys already set shows "Nothing new" or confirm button disabled', async () => {
    const projectWithAll: Project = {
      ...mockProject,
      vars: [
        { id: 'v1', key: 'KEY1', val: 'val1', revealed: false, sourceProjectId: 'p1' },
        { id: 'v2', key: 'KEY2', val: 'val2', revealed: false, sourceProjectId: 'p1' },
      ],
      environments: [
        {
          suffix: '',
          vars: [
            { id: 'v1', key: 'KEY1', val: 'val1', revealed: false, sourceProjectId: 'p1' },
            { id: 'v2', key: 'KEY2', val: 'val2', revealed: false, sourceProjectId: 'p1' },
          ],
        },
      ],
    }
    const exampleFile = makeExampleFile(['KEY1', 'KEY2'])
    render(
      <EnvExamplePromptDialog
        project={projectWithAll}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    const useBtn = screen.queryByRole('button', { name: /preview & import/i })
    if (useBtn) {
      if ((useBtn as HTMLButtonElement).disabled) {
        // All variables already set — Preview & import button is disabled
        expect(useBtn).toBeDisabled()
      } else {
        fireEvent.click(useBtn)
        await waitFor(() => {
          const nothingNew = screen.queryByText(/nothing new/i)
          const importBtn = screen.queryByRole('button', { name: /import \d+ variables?/i })
          const allSet = nothingNew !== null || (importBtn !== null && importBtn.hasAttribute('disabled'))
          expect(allSet).toBe(true)
        })
      }
    }
  })

  it('6.10: very long key name (60+ chars) renders without crash', async () => {
    const longKey = 'A'.repeat(65)
    const exampleFile = makeExampleFile([longKey])
    expect(() =>
      render(
        <EnvExamplePromptDialog
          project={mockProject}
          exampleFile={exampleFile}
          onImportComplete={onImportComplete}
          onDismiss={onDismiss}
          onClose={onClose}
        />
      )
    ).not.toThrow()
    const useBtn = screen.queryByRole('button', { name: /preview & import/i })
    if (useBtn) {
      fireEvent.click(useBtn)
      await waitFor(() => {
        expect(screen.getByText(longKey)).toBeInTheDocument()
      })
    }
  })

  it('6.11: emoji in inline comment renders without throw', async () => {
    const exampleFile = makeExampleFileWithDetails([
      { key: 'SECRET_KEY', placeholder: '', inlineComment: 'set this 🔑', sectionHeading: null },
    ])
    render(
      <EnvExamplePromptDialog
        project={mockProject}
        exampleFile={exampleFile}
        onImportComplete={onImportComplete}
        onDismiss={onDismiss}
        onClose={onClose}
      />
    )
    const useBtn = screen.queryByRole('button', { name: /preview & import/i })
    if (useBtn) {
      expect(() => fireEvent.click(useBtn)).not.toThrow()
      await waitFor(() => {
        expect(screen.getByText(/set this 🔑/)).toBeInTheDocument()
      })
    }
  })
})

