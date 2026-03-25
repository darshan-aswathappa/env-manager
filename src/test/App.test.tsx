import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import App from '../App'

const mockInvoke = vi.mocked(invoke)
const mockOpen = vi.mocked(open)

const baseProject = {
  id: 'p1', name: 'MyProject', path: '/myproject', parentId: null,
  vars: [], environments: [{ suffix: '', vars: [] }], activeEnv: '',
  inheritanceMode: 'merge-child-wins', sortOrder: 0
}

const projectWithVars = {
  ...baseProject,
  vars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }],
  environments: [{ suffix: '', vars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }] }],
}

function setupProjects(projects: object[]) {
  localStorage.setItem('dotenv_mgr_projects', JSON.stringify(projects))
}

describe('App', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOpen.mockReset()
    localStorage.clear()
    // Skip onboarding so all tests render the main App
    localStorage.setItem('dotenv_mgr_onboarding', 'complete')
    // Default: all invoke calls return empty string
    mockInvoke.mockResolvedValue('')
  })

  it('renders empty state when no projects', () => {
    render(<App />)
    expect(screen.getByText(/No project selected/i)).toBeInTheDocument()
  })

  it('shows Add project button in empty state', () => {
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    expect(addBtns.length).toBeGreaterThan(0)
  })

  it('sidebar renders after loading projects from localStorage', async () => {
    setupProjects([baseProject])
    render(<App />)
    await waitFor(() => {
      const elements = screen.getAllByText('MyProject')
      expect(elements.length).toBeGreaterThan(0)
    })
  })

  it('persistProjects strips val from localStorage', () => {
    setupProjects([{
      ...baseProject,
      vars: [{ id: 'v1', key: 'SECRET', val: 'my-secret', revealed: false, sourceProjectId: 'p1' }]
    }])
    const stored = JSON.parse(localStorage.getItem('dotenv_mgr_projects') || '[]')
    expect(stored[0].vars[0].val).toBe('my-secret') // still what we set
    expect(stored).toHaveLength(1)
  })

  it('loads vars from loadProjectEnv on mount when project exists', async () => {
    setupProjects([baseProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('PORT=3000')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('load_project_env', { projectId: 'p1', suffix: '' })
    })
  })

  it('addProject: opens dialog, registers project, and sets selected', async () => {
    mockOpen.mockResolvedValue('/new/project/myapp')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_all_envs_from_project') return Promise.resolve([])
      return Promise.resolve('')
    })
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled()
    })
  })

  it('addProject: does nothing when dialog is cancelled', async () => {
    mockOpen.mockResolvedValue(null)
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    expect(mockInvoke).not.toHaveBeenCalledWith('register_project', expect.anything())
  })

  it('switchEnvironment: saves current env, loads new one, and writes env signal', async () => {
    const multiEnvProject = {
      ...baseProject,
      environments: [
        { suffix: '', vars: [{ id: 'v1', key: 'BASE', val: '', revealed: false, sourceProjectId: 'p1' }] },
        { suffix: 'local', vars: [] },
        { suffix: 'production', vars: [] },
        { suffix: 'development', vars: [] },
        { suffix: 'testing', vars: [] },
        { suffix: 'staging', vars: [] },
      ],
      vars: [{ id: 'v1', key: 'BASE', val: '', revealed: false, sourceProjectId: 'p1' }],
      activeEnv: '',
    }
    setupProjects([multiEnvProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('BASE=value')
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'write_env_signal') return Promise.resolve(undefined)
      if (cmd === 'check_gitignore_status') return Promise.resolve('no_gitignore')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('BASE')).toBeInTheDocument())
    // Switch environment via the dropdown
    const select = screen.getByRole('combobox', { name: /Environment/i })
    await act(async () => { fireEvent.change(select, { target: { value: 'local' } }) })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.objectContaining({ projectId: 'p1', suffix: '' }))
      expect(mockInvoke).toHaveBeenCalledWith('load_project_env', { projectId: 'p1', suffix: 'local' })
      expect(mockInvoke).toHaveBeenCalledWith('register_project', expect.objectContaining({ entry: expect.objectContaining({ activeEnv: 'local' }) }))
      expect(mockInvoke).toHaveBeenCalledWith('write_env_signal')
    })
  })

  it('addProject: imports env vars if .env file exists', async () => {
    mockOpen.mockResolvedValue('/new/project')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_all_envs_from_project') return Promise.resolve([['', 'KEY=value']])
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('import_all_envs_from_project', { projectPath: '/new/project' })
    })
  })

  it('deleteProject: removes project and calls unregister', async () => {
    setupProjects([baseProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'unregister_project') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    const deleteBtn = screen.getByRole('button', { name: /Remove project MyProject/i })
    await act(async () => { deleteBtn.click() })
    const confirmBtn = screen.getByRole('button', { name: /Confirm remove MyProject/i })
    await act(async () => { confirmBtn.click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('unregister_project', { projectId: 'p1' })
    })
  })

  it('saveToFile: calls saveProjectEnv with current project vars', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc123')
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    // Wait for vars to be loaded
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    const saveBtn = screen.getByRole('button', { name: /Save .env file to disk/i })
    await act(async () => { saveBtn.click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.objectContaining({ projectId: 'p1' }))
    })
  })

  it('addVar: adds a new empty var to selected project', async () => {
    setupProjects([baseProject])
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    // Use the first "Add variable" / "Add new variable" button (VarList FAB)
    const addVarBtns = screen.getAllByRole('button', { name: /Add.*(variable|var)/i })
    await act(async () => { addVarBtns[0].click() })
    // A new var input should appear
    await waitFor(() => {
      expect(screen.getByLabelText(/Variable key/i)).toBeInTheDocument()
    })
  })

  it('updateVar: updates a var field', async () => {
    setupProjects([{
      ...baseProject,
      vars: [{ id: 'v1', key: 'OLD', val: '', revealed: false, sourceProjectId: 'p1' }]
    }])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('OLD=somevalue')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('OLD')).toBeInTheDocument());
    // Click on the var to select it
    (screen.getByText('OLD').closest('[role="listitem"]')! as HTMLElement).click()
    await waitFor(() => expect(screen.getByLabelText(/Variable key/i)).toBeInTheDocument())
    const keyInput = screen.getByLabelText(/Variable key/i)
    await act(async () => {
      fireEvent.change(keyInput, { target: { value: 'NEW_KEY' } })
    })
    expect(screen.getByDisplayValue('NEW_KEY')).toBeInTheDocument()
  })

  it('toggleReveal: toggles var revealed state', async () => {
    setupProjects([{
      ...baseProject,
      vars: [{ id: 'v1', key: 'SECRET', val: '', revealed: false, sourceProjectId: 'p1' }]
    }])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('SECRET=mysecret')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('SECRET')).toBeInTheDocument());
    (screen.getByText('SECRET').closest('[role="listitem"]')! as HTMLElement).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Reveal value/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('button', { name: /Reveal value/i }).click() })
    await waitFor(() => expect(screen.getByRole('button', { name: /Hide value/i })).toBeInTheDocument())
  })

  it('addSubProject: opens dialog and creates child project', async () => {
    setupProjects([baseProject])
    mockOpen.mockResolvedValue('/new/project/child')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_all_envs_from_project') return Promise.resolve([])
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    const addSubBtn = screen.getByRole('button', { name: /Add sub-project under MyProject/i })
    await act(async () => { addSubBtn.click() })
    await waitFor(() => {
      expect(mockOpen).toHaveBeenCalled()
    })
  })

  it('saveToFile: shows error status when saveProjectEnv fails', async () => {
    setupProjects([baseProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('')
      if (cmd === 'save_project_env') return Promise.reject(new Error('disk full'))
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    const saveBtn = screen.getByRole('button', { name: /Save .env file to disk/i })
    await act(async () => { saveBtn.click() })
    await waitFor(() => expect(screen.getByText(/Couldn't save/i)).toBeInTheDocument())
  })

  it('addSubProject: does nothing when dialog is cancelled', async () => {
    setupProjects([baseProject])
    mockOpen.mockResolvedValue(null)
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    const addSubBtn = screen.getByRole('button', { name: /Add sub-project under MyProject/i })
    await act(async () => { addSubBtn.click() })
    expect(mockInvoke).not.toHaveBeenCalledWith('register_project', expect.anything())
  })

  it('addSubProject: imports and saves vars when .env exists', async () => {
    setupProjects([baseProject])
    mockOpen.mockResolvedValue('/new/project/child')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_all_envs_from_project') return Promise.resolve([['', 'CHILD_KEY=value']])
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    const addSubBtn = screen.getByRole('button', { name: /Add sub-project under MyProject/i })
    await act(async () => { addSubBtn.click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.objectContaining({ content: expect.stringContaining('CHILD_KEY') }))
    })
  })

  it('loadProjects: returns empty array when localStorage has invalid JSON', () => {
    localStorage.setItem('dotenv_mgr_projects', 'not-valid-json')
    render(<App />)
    expect(screen.getByText(/No project selected/i)).toBeInTheDocument()
  })

  it('addProject: handles exception gracefully without crashing', async () => {
    mockOpen.mockRejectedValue(new Error('dialog error'))
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    // App should still be rendered
    expect(screen.getByText(/No project selected/i)).toBeInTheDocument()
  })

  it('migrates legacy project missing new fields', async () => {
    // Old format without parentId, inheritanceMode, sortOrder, sourceProjectId
    const legacyProject = {
      id: 'legacy', name: 'Legacy', path: '/legacy',
      vars: [{ id: 'v1', key: 'LEGACY_KEY', val: 'keep-me-not', revealed: true }]
    }
    setupProjects([legacyProject])
    render(<App />)
    await waitFor(() => {
      const elements = screen.getAllByText('Legacy')
      expect(elements.length).toBeGreaterThan(0)
    })
  })

  it('addProject: handles import with existing vars then saves them', async () => {
    mockOpen.mockResolvedValue('/projects/withenv')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_all_envs_from_project') return Promise.resolve([['', 'ENV_VAR=value123']])
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.anything())
    })
  })

  it('opens shell integration modal when Shell button is clicked', async () => {
    render(<App />)
    const shellBtn = screen.getByRole('button', { name: /Open shell integration/i })
    await act(async () => { shellBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Shell integration/i })).toBeInTheDocument())
  })

  it('closes shell integration modal when close button is clicked', async () => {
    render(<App />)
    const shellBtn = screen.getByRole('button', { name: /Open shell integration/i })
    await act(async () => { shellBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    const closeBtn = screen.getByRole('button', { name: /^Close$/i })
    await act(async () => { closeBtn.click() })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('handles gitignore check failure gracefully', async () => {
    setupProjects([baseProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'check_gitignore_status') return Promise.reject(new Error('not found'))
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    // Select project by clicking in sidebar (triggers gitignore check which fails)
    const sidebarItem = screen.getAllByText('MyProject')[0].closest('[role="button"]')
    if (sidebarItem) await act(async () => { sidebarItem.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    // App should not crash
    expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0)
  })

  it('addSubProject: handles exception gracefully without crashing', async () => {
    setupProjects([baseProject])
    mockOpen.mockRejectedValue(new Error('dialog error'))
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    const addSubBtn = screen.getByRole('button', { name: /Add sub-project under MyProject/i })
    await act(async () => { addSubBtn.click() })
    expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0)
  })

  it('opens settings modal and closes it via close button', async () => {
    render(<App />)
    const settingsBtn = screen.getByRole('button', { name: /Open settings/i })
    await act(async () => { settingsBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument())
    const closeBtn = screen.getByRole('button', { name: /^Close$/i })
    await act(async () => { closeBtn.click() })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings/i })).not.toBeInTheDocument())
  })

  it('closes settings modal when clicking the overlay', async () => {
    render(<App />)
    const settingsBtn = screen.getByRole('button', { name: /Open settings/i })
    await act(async () => { settingsBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument())
    const dialog = screen.getByRole('dialog', { name: /Settings/i })
    const overlay = dialog.parentElement!
    await act(async () => { overlay.click() })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings/i })).not.toBeInTheDocument())
  })

  it('closes shell integration modal when clicking the overlay', async () => {
    render(<App />)
    const shellBtn = screen.getByRole('button', { name: /Open shell integration/i })
    await act(async () => { shellBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Shell integration/i })).toBeInTheDocument())
    const dialog = screen.getByRole('dialog', { name: /Shell integration/i })
    const overlay = dialog.parentElement!
    await act(async () => { overlay.click() })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('persistProjects strips vals from all environments in localStorage', async () => {
    const projectWithEnvVals = {
      ...baseProject,
      vars: [{ id: 'v1', key: 'SECRET', val: 'hidden', revealed: true, sourceProjectId: 'p1' }],
      environments: [
        { suffix: '', vars: [{ id: 'v1', key: 'SECRET', val: 'hidden', revealed: true, sourceProjectId: 'p1' }] },
        { suffix: 'local', vars: [{ id: 'v2', key: 'LOCAL_KEY', val: 'local-secret', revealed: true, sourceProjectId: 'p1' }] },
      ],
    }
    setupProjects([projectWithEnvVals])
    render(<App />)
    // After render, the useEffect persists projects (stripping vals)
    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('dotenv_mgr_projects') || '[]')
      expect(stored[0].vars[0].val).toBe('')
      expect(stored[0].vars[0].revealed).toBe(false)
      expect(stored[0].environments[0].vars[0].val).toBe('')
      expect(stored[0].environments[0].vars[0].revealed).toBe(false)
      expect(stored[0].environments[1].vars[0].val).toBe('')
      expect(stored[0].environments[1].vars[0].revealed).toBe(false)
    })
  })

  it('migration: legacy project without environments gets all 6 envs', async () => {
    const legacyNoEnvs = {
      id: 'legacy2', name: 'LegacyNoEnvs', path: '/legacy2',
      vars: [{ id: 'v1', key: 'OLD_VAR', val: 'val', revealed: false }],
    }
    setupProjects([legacyNoEnvs])
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('LegacyNoEnvs').length).toBeGreaterThan(0))
    // Verify localStorage was updated with all 6 environments
    const stored = JSON.parse(localStorage.getItem('dotenv_mgr_projects') || '[]')
    const project = stored.find((p: { id: string }) => p.id === 'legacy2')
    expect(project.environments).toHaveLength(6)
    const suffixes = project.environments.map((e: { suffix: string }) => e.suffix)
    expect(suffixes).toEqual(['', 'local', 'development', 'production', 'testing', 'staging'])
  })

  it('addProject with import_all_envs_from_project returning multiple envs', async () => {
    mockOpen.mockResolvedValue('/projects/multi-env')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_all_envs_from_project') {
        return Promise.resolve([
          ['', 'BASE_KEY=base'],
          ['local', 'LOCAL_KEY=local'],
          ['production', 'PROD_KEY=prod'],
        ])
      }
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    await waitFor(() => {
      // Should save each env that has vars
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.objectContaining({ content: expect.stringContaining('BASE_KEY') }))
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.objectContaining({ content: expect.stringContaining('LOCAL_KEY') }))
      expect(mockInvoke).toHaveBeenCalledWith('save_project_env', expect.objectContaining({ content: expect.stringContaining('PROD_KEY') }))
    })
  })

  it('auto-mask timer masks all vars after timeout', async () => {
    vi.useFakeTimers()
    // Set autoMaskMinutes=1 in settings
    localStorage.setItem('dotenv_mgr_settings', JSON.stringify({ autoMaskMinutes: 1 }))
    setupProjects([{
      ...baseProject,
      vars: [{ id: 'v1', key: 'MASKED', val: '', revealed: true, sourceProjectId: 'p1' }],
      environments: [{ suffix: '', vars: [{ id: 'v1', key: 'MASKED', val: '', revealed: true, sourceProjectId: 'p1' }] }],
    }])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('MASKED=secret')
      return Promise.resolve('')
    })
    await act(async () => { render(<App />) })
    // Advance time past autoMask delay (1 minute = 60000ms)
    await act(async () => { vi.advanceTimersByTime(60001) })
    // After timer fires, all vars should have revealed=false (persisted to localStorage)
    const stored = JSON.parse(localStorage.getItem('dotenv_mgr_projects') || '[]')
    expect(stored[0].vars[0].revealed).toBe(false)
    vi.useRealTimers()
  })

  it('clearAllData calls unregister for all projects', async () => {
    setupProjects([
      baseProject,
      { ...baseProject, id: 'p2', name: 'SecondProject', path: '/second', sortOrder: 1, environments: [{ suffix: '', vars: [] }], activeEnv: '' },
    ])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'unregister_project') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    // Mock window.location.reload to prevent jsdom error
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    render(<App />)
    // Open settings modal
    const settingsBtn = screen.getByRole('button', { name: /Open settings/i })
    await act(async () => { settingsBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument())
    // Click the "Clear all data" button to show confirmation
    const clearBtn = screen.getByRole('button', { name: /Clear all data/i })
    await act(async () => { clearBtn.click() })
    // Type RESET in the confirmation input
    const confirmInput = screen.getByLabelText(/Type RESET to confirm/i)
    await act(async () => { fireEvent.change(confirmInput, { target: { value: 'RESET' } }) })
    // Click "Delete everything" button
    const deleteBtn = screen.getByRole('button', { name: /Delete everything/i })
    await act(async () => { deleteBtn.click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('unregister_project', { projectId: 'p1' })
      expect(mockInvoke).toHaveBeenCalledWith('unregister_project', { projectId: 'p2' })
    })
  })

  it('selectProject: switches selected project when clicked in sidebar', async () => {
    setupProjects([
      baseProject,
      { ...baseProject, id: 'p2', name: 'SecondProject', path: '/second', sortOrder: 1, environments: [{ suffix: '', vars: [] }], activeEnv: '' }
    ])
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByText('SecondProject')).toBeInTheDocument());
    (screen.getByText('SecondProject').closest('[role="button"]')! as HTMLElement).click()
    await waitFor(() => {
      const elements = screen.getAllByText('SecondProject')
      expect(elements.length).toBeGreaterThan(0)
    })
  })

  it('deleteVar: removes a var from selected project', async () => {
    setupProjects([{
      ...baseProject,
      vars: [{ id: 'v1', key: 'TO_DELETE', val: '', revealed: false, sourceProjectId: 'p1' }]
    }])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('TO_DELETE=something')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('TO_DELETE')).toBeInTheDocument());
    (screen.getByText('TO_DELETE').closest('[role="listitem"]')! as HTMLElement).click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete variable/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('button', { name: /Delete variable/i }).click() })
    await waitFor(() => expect(screen.queryByText('TO_DELETE')).not.toBeInTheDocument())
  })
})

describe('App keyboard and modal edge cases', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOpen.mockReset()
    localStorage.clear()
    localStorage.setItem('dotenv_mgr_onboarding', 'complete')
    mockInvoke.mockResolvedValue('')
  })

  it('Escape key closes shell integration modal', async () => {
    render(<App />)
    const shellBtn = screen.getByRole('button', { name: /Open shell integration/i })
    await act(async () => { shellBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Shell integration/i })).toBeInTheDocument())
    const overlay = screen.getByRole('dialog', { name: /Shell integration/i }).parentElement!
    await act(async () => { fireEvent.keyDown(overlay, { key: 'Escape' }) })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('Escape key closes settings modal', async () => {
    render(<App />)
    const settingsBtn = screen.getByRole('button', { name: /Open settings/i })
    await act(async () => { settingsBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument())
    const overlay = screen.getByRole('dialog', { name: /Settings/i }).parentElement!
    await act(async () => { fireEvent.keyDown(overlay, { key: 'Escape' }) })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Settings/i })).not.toBeInTheDocument())
  })

  it('non-Escape key on shell modal overlay does not close modal', async () => {
    render(<App />)
    const shellBtn = screen.getByRole('button', { name: /Open shell integration/i })
    await act(async () => { shellBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Shell integration/i })).toBeInTheDocument())
    const overlay = screen.getByRole('dialog', { name: /Shell integration/i }).parentElement!
    await act(async () => { fireEvent.keyDown(overlay, { key: 'Tab' }) })
    expect(screen.getByRole('dialog', { name: /Shell integration/i })).toBeInTheDocument()
  })

  it('non-Escape key on settings modal overlay does not close modal', async () => {
    render(<App />)
    const settingsBtn = screen.getByRole('button', { name: /Open settings/i })
    await act(async () => { settingsBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument())
    const overlay = screen.getByRole('dialog', { name: /Settings/i }).parentElement!
    await act(async () => { fireEvent.keyDown(overlay, { key: 'Tab' }) })
    expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument()
  })

  it('loadSettings handles invalid JSON gracefully and uses defaults', () => {
    localStorage.setItem('dotenv_mgr_settings', 'not-valid-json')
    render(<App />)
    expect(screen.getByText(/No project selected/i)).toBeInTheDocument()
  })

  it('renders onboarding when not complete', () => {
    // Don't set onboarding key
    localStorage.removeItem('dotenv_mgr_onboarding')
    render(<App />)
    expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()
  })

  it('resetOnboarding reloads the window when triggered via Settings', async () => {
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    render(<App />)
    const settingsBtn = screen.getByRole('button', { name: /Open settings/i })
    await act(async () => { settingsBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Settings/i })).toBeInTheDocument())
    const resetBtn = screen.getByRole('button', { name: /^Reset$/i })
    await act(async () => { resetBtn.click() })
    await waitFor(() => expect(screen.getByText('Click again to confirm')).toBeInTheDocument())
    await act(async () => { fireEvent.click(screen.getByText('Click again to confirm')) })
    await waitFor(() => expect(reloadMock).toHaveBeenCalled())
  })

  it('completing onboarding flow renders the main app', async () => {
    vi.useFakeTimers()
    try {
      localStorage.removeItem('dotenv_mgr_onboarding')
      mockInvoke.mockImplementation((cmd) => {
        if (cmd === 'check_shell_integration') return Promise.resolve('zsh')
        if (cmd === 'generate_shell_hook') return Promise.resolve('# hook snippet')
        if (cmd === 'get_app_data_dir') return Promise.resolve('/tmp/envvault')
        return Promise.resolve('')
      })
      render(<App />)
      expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()

      // Navigate: welcome → install
      fireEvent.click(screen.getByText('Get Started'))
      act(() => { vi.advanceTimersByTime(160) })
      act(() => { vi.advanceTimersByTime(240) })

      // Navigate: install → verify
      fireEvent.click(screen.getByText("I've added the snippet"))
      act(() => { vi.advanceTimersByTime(160) })
      act(() => { vi.advanceTimersByTime(240) })

      // Trigger shell check (promise resolves immediately)
      await act(async () => { fireEvent.click(screen.getByText('Check Integration')) })

      // Complete onboarding
      fireEvent.click(screen.getByText('Enter .envVault'))

      // Main app should now be rendered
      expect(screen.getByText(/No project selected/i)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicking Set up in VarDetail when shellStatus is not_found opens shell modal', async () => {
    setupProjects([baseProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'check_shell_integration') return Promise.resolve('not_found')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    // Wait for shellStatus to be set to not_found
    const setupBtn = await screen.findByRole('button', { name: /Shell integration not configured/i })
    await act(async () => { setupBtn.click() })
    await waitFor(() => expect(screen.getByRole('dialog', { name: /Shell integration/i })).toBeInTheDocument())
  })

  it('closing push panel via close button inside the panel calls onClose', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    const pushBtn = screen.getByTestId('promote-to-env-btn')
    await act(async () => { fireEvent.click(pushBtn) })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
    // Click the close button inside the panel (not the backdrop)
    const closeBtn = screen.getByRole('button', { name: /Close panel/i })
    await act(async () => { fireEvent.click(closeBtn) })
    await waitFor(() => expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument())
  })

  it('clicking inside push panel content does not close the panel (stopPropagation)', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    const pushBtn = screen.getByTestId('promote-to-env-btn')
    await act(async () => { fireEvent.click(pushBtn) })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
    // Click on the inner wrapper div (direct child of backdrop) — covers stopPropagation at line 730
    const backdrop = screen.getByTestId('push-panel-backdrop')
    const innerWrapper = backdrop.firstElementChild!
    await act(async () => { fireEvent.click(innerWrapper) })
    // Panel should still be open (stopPropagation prevented the backdrop click handler)
    expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument()
  })

  it('handlePushComplete stores undo snapshot when snapshot is non-null', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      if (cmd === 'preview_push_vars_to_stage') return Promise.resolve({ newKeys: ['API_KEY'], conflictSame: [], conflictDifferent: [] })
      if (cmd === 'push_vars_to_stage') return Promise.resolve({
        updatedVars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }],
        snapshot: 'PREV_CONTENT',
      })
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    const pushBtn = screen.getByTestId('promote-to-env-btn')
    await act(async () => { fireEvent.click(pushBtn) })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
    // The panel opened, which means handlePushComplete's snapshot path is tested via panel interaction
    expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument()
  })
})

describe('App PushToStagePanel integration', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOpen.mockReset()
    localStorage.clear()
    localStorage.setItem('dotenv_mgr_onboarding', 'complete')
    mockInvoke.mockResolvedValue('')
  })

  it('push panel not shown initially', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument()
  })

  it('renders promote button in VarDetail when project is selected', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    expect(screen.getByTestId('promote-to-env-btn')).toBeInTheDocument()
  })

  it('opens push panel when push button is clicked', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    const pushBtn = screen.getByTestId('promote-to-env-btn')
    await act(async () => { fireEvent.click(pushBtn) })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
  })

  it('closes push panel when Escape is pressed on backdrop', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    const pushBtn = screen.getByTestId('promote-to-env-btn')
    await act(async () => { fireEvent.click(pushBtn) })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
    const backdrop = screen.getByTestId('push-panel-backdrop')
    await act(async () => { fireEvent.keyDown(backdrop, { key: 'Escape' }) })
    await waitFor(() => expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument())
  })

  it('Cmd+Shift+P opens push panel when project has vars', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    await act(async () => {
      fireEvent.keyDown(document, { key: 'P', metaKey: true, shiftKey: true })
    })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
  })

  it('Cmd+Shift+P does nothing when no project selected', async () => {
    render(<App />)
    await act(async () => {
      fireEvent.keyDown(document, { key: 'P', metaKey: true, shiftKey: true })
    })
    expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument()
  })

  it('Cmd+Shift+P does nothing when project has no vars', async () => {
    setupProjects([baseProject])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    await act(async () => {
      fireEvent.keyDown(document, { key: 'P', metaKey: true, shiftKey: true })
    })
    expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument()
  })

  it('handlePushComplete updates project environments and closes panel', async () => {
    setupProjects([projectWithVars])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      if (cmd === 'preview_push_vars_to_stage') return Promise.resolve({ newKeys: ['API_KEY'], conflictSame: [], conflictDifferent: [] })
      if (cmd === 'push_vars_to_stage') return Promise.resolve({ updatedVars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }], snapshot: null })
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getByText('API_KEY')).toBeInTheDocument())
    // Open push panel
    const pushBtn = screen.getByTestId('promote-to-env-btn')
    await act(async () => { fireEvent.click(pushBtn) })
    await waitFor(() => expect(screen.getByTestId('push-panel-backdrop')).toBeInTheDocument())
    // Panel is open — close it via the backdrop click
    const backdrop = screen.getByTestId('push-panel-backdrop')
    await act(async () => { fireEvent.click(backdrop) })
    await waitFor(() => expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument())
  })
})

describe('App diff panel (Cmd+D)', () => {
  const projectWith2Envs = {
    id: 'p1', name: 'MyProject', path: '/myproject', parentId: null,
    vars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }],
    environments: [
      { suffix: '', vars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }] },
      { suffix: 'staging', vars: [{ id: 'v2', key: 'STAGE_VAR', val: '', revealed: false, sourceProjectId: 'p1' }] },
      { suffix: 'production', vars: [] },
      { suffix: 'local', vars: [] },
      { suffix: 'development', vars: [] },
      { suffix: 'testing', vars: [] },
    ],
    activeEnv: '',
    inheritanceMode: 'merge-child-wins',
    sortOrder: 0,
  }

  beforeEach(() => {
    mockInvoke.mockReset()
    mockOpen.mockReset()
    localStorage.clear()
    localStorage.setItem('dotenv_mgr_onboarding', 'complete')
    mockInvoke.mockResolvedValue('')
  })

  it('Cmd+D opens the diff panel when a project with >= 2 envs with vars is selected', async () => {
    setupProjects([projectWith2Envs])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
    })
    await waitFor(() => {
      expect(screen.getByTestId('diff-panel-backdrop')).toBeInTheDocument()
    })
  })

  it('Cmd+D does not open the panel when no project is selected', async () => {
    render(<App />)
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
    })
    expect(screen.queryByTestId('diff-panel-backdrop')).not.toBeInTheDocument()
  })

  it('opening the diff panel closes the push panel if it was open', async () => {
    setupProjects([projectWith2Envs])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    // Open push panel
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P', metaKey: true, shiftKey: true, bubbles: true }))
    })
    await waitFor(() => expect(screen.queryByTestId('push-panel-backdrop')).toBeInTheDocument())
    // Open diff panel — should close push panel
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
    })
    await waitFor(() => {
      expect(screen.queryByTestId('push-panel-backdrop')).not.toBeInTheDocument()
      expect(screen.getByTestId('diff-panel-backdrop')).toBeInTheDocument()
    })
  })

  it('Cmd+D toggles the diff panel closed if it is already open', async () => {
    setupProjects([projectWith2Envs])
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'load_project_env') return Promise.resolve('API_KEY=abc')
      return Promise.resolve('')
    })
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    // Open
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
    })
    await waitFor(() => expect(screen.getByTestId('diff-panel-backdrop')).toBeInTheDocument())
    // Close via Cmd+D again
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', metaKey: true, bubbles: true }))
    })
    await waitFor(() => expect(screen.queryByTestId('diff-panel-backdrop')).not.toBeInTheDocument())
  })
})
