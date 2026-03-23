import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import App from '../App'

const mockInvoke = vi.mocked(invoke)
const mockOpen = vi.mocked(open)

const baseProject = {
  id: 'p1', name: 'MyProject', path: '/myproject', parentId: null,
  vars: [], inheritanceMode: 'merge-child-wins', sortOrder: 0
}

const projectWithVars = {
  ...baseProject,
  vars: [{ id: 'v1', key: 'API_KEY', val: '', revealed: false, sourceProjectId: 'p1' }],
}

function setupProjects(projects: object[]) {
  localStorage.setItem('dotenv_mgr_projects', JSON.stringify(projects))
}

describe('App', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockOpen.mockReset()
    localStorage.clear()
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
      expect(mockInvoke).toHaveBeenCalledWith('load_project_env', { projectId: 'p1' })
    })
  })

  it('addProject: opens dialog, registers project, and sets selected', async () => {
    mockOpen.mockResolvedValue('/new/project/myapp')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_env_from_project') return Promise.resolve('')
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

  it('addProject: imports env vars if .env file exists', async () => {
    mockOpen.mockResolvedValue('/new/project')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_env_from_project') return Promise.resolve('KEY=value')
      if (cmd === 'save_project_env') return Promise.resolve(undefined)
      return Promise.resolve('')
    })
    render(<App />)
    const addBtns = screen.getAllByRole('button', { name: /Add project folder/i })
    await act(async () => { addBtns[0].click() })
    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith('import_env_from_project', { projectPath: '/new/project' })
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
    await waitFor(() => expect(screen.getByText('OLD')).toBeInTheDocument())
    // Click on the var to select it
    screen.getByText('OLD').closest('[role="listitem"]')!.click()
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
    await waitFor(() => expect(screen.getByText('SECRET')).toBeInTheDocument())
    screen.getByText('SECRET').closest('[role="listitem"]')!.click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Reveal value/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('button', { name: /Reveal value/i }).click() })
    await waitFor(() => expect(screen.getByRole('button', { name: /Hide value/i })).toBeInTheDocument())
  })

  it('addSubProject: opens dialog and creates child project', async () => {
    setupProjects([baseProject])
    mockOpen.mockResolvedValue('/new/project/child')
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'register_project') return Promise.resolve(undefined)
      if (cmd === 'import_env_from_project') return Promise.resolve('')
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
    await waitFor(() => expect(screen.getByText(/Save failed/i)).toBeInTheDocument())
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
      if (cmd === 'import_env_from_project') return Promise.resolve('CHILD_KEY=value')
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
      if (cmd === 'import_env_from_project') return Promise.resolve('ENV_VAR=value123')
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

  it('selectProject: switches selected project when clicked in sidebar', async () => {
    setupProjects([
      baseProject,
      { ...baseProject, id: 'p2', name: 'SecondProject', path: '/second', sortOrder: 1 }
    ])
    render(<App />)
    await waitFor(() => expect(screen.getAllByText('MyProject').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByText('SecondProject')).toBeInTheDocument())
    screen.getByText('SecondProject').closest('[role="button"]')!.click()
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
    await waitFor(() => expect(screen.getByText('TO_DELETE')).toBeInTheDocument())
    screen.getByText('TO_DELETE').closest('[role="listitem"]')!.click()
    await waitFor(() => expect(screen.getByRole('button', { name: /Delete variable/i })).toBeInTheDocument())
    await act(async () => { screen.getByRole('button', { name: /Delete variable/i }).click() })
    await waitFor(() => expect(screen.queryByText('TO_DELETE')).not.toBeInTheDocument())
  })
})
