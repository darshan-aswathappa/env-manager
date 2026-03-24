import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import VarDetail from '../components/VarDetail'
import type { Project, EnvVar } from '../types'

const makeProject = (): Project => ({
  id: 'p1', name: 'My Project', path: '/myproject', parentId: null,
  vars: [], environments: [{ suffix: '', vars: [] }], activeEnv: '',
  inheritanceMode: 'merge-child-wins', sortOrder: 0,
})

const makeVar = (key = 'API_KEY', val = 'secret'): EnvVar => ({
  id: 'var-1', key, val, revealed: false, sourceProjectId: 'p1',
})

const defaultProps = {
  project: makeProject(),
  selectedVar: null,
  gitignoreStatus: 'no_gitignore' as const,
  saveStatus: 'idle' as const,
  environments: [
    { suffix: '', vars: [] },
    { suffix: 'local', vars: [] },
    { suffix: 'development', vars: [] },
    { suffix: 'production', vars: [] },
    { suffix: 'testing', vars: [] },
    { suffix: 'staging', vars: [] },
  ],
  activeEnv: '',
  onUpdateVar: vi.fn(),
  onDeleteVar: vi.fn(),
  onToggleReveal: vi.fn(),
  onAddVar: vi.fn(),
  onSave: vi.fn(),
  onSwitchEnvironment: vi.fn(),
}

describe('VarDetail', () => {
  it('renders project name in header', () => {
    render(<VarDetail {...defaultProps} />)
    expect(screen.getByText('My Project')).toBeInTheDocument()
  })

  it('shows no variable selected state when selectedVar is null', () => {
    render(<VarDetail {...defaultProps} />)
    expect(screen.getByText(/No variable selected/i)).toBeInTheDocument()
  })

  it('shows warning icon with tooltip when no gitignore exists', () => {
    render(<VarDetail {...defaultProps} gitignoreStatus="no_gitignore" />)
    const badge = screen.getByTitle(/No .gitignore found/i)
    expect(badge).toBeInTheDocument()
    expect(badge.querySelector('svg')).toBeTruthy()
  })

  it('shows warning icon with tooltip when .env is not listed', () => {
    render(<VarDetail {...defaultProps} gitignoreStatus="not_listed" />)
    const badge = screen.getByTitle(/.env is NOT listed/i)
    expect(badge).toBeInTheDocument()
    expect(badge.querySelector('svg')).toBeTruthy()
  })

  it('shows success icon with tooltip when .env is listed', () => {
    render(<VarDetail {...defaultProps} gitignoreStatus="listed" />)
    const badge = screen.getByTitle(/.env is listed in .gitignore/i)
    expect(badge).toBeInTheDocument()
    expect(badge.querySelector('svg')).toBeTruthy()
  })

  it('renders var fields when selectedVar is provided', () => {
    const v = makeVar('DATABASE_URL', 'postgres://localhost')
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(screen.getByDisplayValue('DATABASE_URL')).toBeInTheDocument()
  })

  it('calls onUpdateVar when key is changed', () => {
    const onUpdateVar = vi.fn()
    const v = makeVar('OLD_KEY', 'val')
    render(<VarDetail {...defaultProps} selectedVar={v} onUpdateVar={onUpdateVar} />)
    const keyInput = screen.getByLabelText(/Variable key/i)
    fireEvent.change(keyInput, { target: { value: 'NEW_KEY' } })
    expect(onUpdateVar).toHaveBeenCalledWith('var-1', 'key', 'NEW_KEY')
  })

  it('calls onDeleteVar when delete button is clicked', () => {
    const onDeleteVar = vi.fn()
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} onDeleteVar={onDeleteVar} />)
    screen.getByRole('button', { name: /Delete variable/i }).click()
    expect(onDeleteVar).toHaveBeenCalledWith('var-1')
  })

  it('calls onToggleReveal when reveal button is clicked', () => {
    const onToggleReveal = vi.fn()
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} onToggleReveal={onToggleReveal} />)
    screen.getByRole('button', { name: /Reveal value/i }).click()
    expect(onToggleReveal).toHaveBeenCalledWith('var-1')
  })

  it('calls onAddVar when add variable button is clicked', () => {
    const onAddVar = vi.fn()
    render(<VarDetail {...defaultProps} onAddVar={onAddVar} />)
    screen.getByRole('button', { name: /Add new variable/i }).click()
    expect(onAddVar).toHaveBeenCalled()
  })

  it('calls onSave when save button is clicked', () => {
    const onSave = vi.fn()
    render(<VarDetail {...defaultProps} onSave={onSave} />)
    screen.getByRole('button', { name: /Save .env file to disk/i }).click()
    expect(onSave).toHaveBeenCalled()
  })

  it('renders environment dropdown', () => {
    render(<VarDetail {...defaultProps} />)
    expect(screen.getByRole('combobox', { name: /Environment/i })).toBeInTheDocument()
  })

  it('calls onSwitchEnvironment when dropdown selection changes', () => {
    const onSwitchEnvironment = vi.fn()
    render(<VarDetail {...defaultProps} onSwitchEnvironment={onSwitchEnvironment} />)
    const select = screen.getByRole('combobox', { name: /Environment/i })
    fireEvent.change(select, { target: { value: 'local' } })
    expect(onSwitchEnvironment).toHaveBeenCalledWith('local')
  })

  it('shows active env name in subtitle', () => {
    render(<VarDetail {...defaultProps} activeEnv="production" />)
    expect(screen.getByText('/myproject/.env.production')).toBeInTheDocument()
  })

  it('shows base env name in subtitle when activeEnv is empty', () => {
    render(<VarDetail {...defaultProps} activeEnv="" />)
    expect(screen.getByText('/myproject/.env')).toBeInTheDocument()
  })

  it('shows saving status', () => {
    render(<VarDetail {...defaultProps} saveStatus="saving" />)
    expect(screen.getByText(/Saving/i)).toBeInTheDocument()
  })

  it('shows saved status', () => {
    render(<VarDetail {...defaultProps} saveStatus="saved" />)
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })

  it('shows error status', () => {
    render(<VarDetail {...defaultProps} saveStatus="error" />)
    expect(screen.getByText(/Save failed/i)).toBeInTheDocument()
  })

  it('disables save button when saving', () => {
    render(<VarDetail {...defaultProps} saveStatus="saving" />)
    const saveBtn = screen.getByRole('button', { name: /Save .env file to disk/i })
    expect(saveBtn).toBeDisabled()
  })

  it('shows active env in save button label', () => {
    render(<VarDetail {...defaultProps} activeEnv="production" />)
    expect(screen.getByRole('button', { name: /Save .env.production file to disk/i })).toBeInTheDocument()
    expect(screen.getByText('Save .env.production')).toBeInTheDocument()
  })

  it('shows reveal button when var has a value', () => {
    const v = makeVar('SECRET', 'myvalue')
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(screen.getByRole('button', { name: /Reveal value/i })).toBeInTheDocument()
  })

  it('shows Hide button when var is revealed', () => {
    const v = { ...makeVar(), revealed: true }
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(screen.getByRole('button', { name: /Hide value/i })).toBeInTheDocument()
  })

  it('copy key button exists when var is selected', () => {
    const v = makeVar('MY_KEY', 'my_val')
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(screen.getByRole('button', { name: /Copy key/i })).toBeInTheDocument()
  })

  it('copy value button exists when var is selected', () => {
    const v = makeVar('MY_KEY', 'my_val')
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(screen.getByRole('button', { name: /Copy value/i })).toBeInTheDocument()
  })

  it('calls onUpdateVar when value field changes', () => {
    const onUpdateVar = vi.fn()
    const v = makeVar('KEY', 'oldval')
    render(<VarDetail {...defaultProps} selectedVar={v} onUpdateVar={onUpdateVar} />)
    const valueInput = screen.getByLabelText(/Value for KEY/i)
    fireEvent.change(valueInput, { target: { value: 'newval' } })
    expect(onUpdateVar).toHaveBeenCalledWith('var-1', 'val', 'newval')
  })

  it('copy button handles clipboard write without crashing', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    const v = makeVar('MY_KEY', 'my_val')
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const copyKeyBtn = screen.getByRole('button', { name: /Copy key/i })
    await act(async () => { copyKeyBtn.click() })
    expect(document.body).toBeTruthy()
  })

  it('copy button with clipboardClearSeconds schedules clear', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    const v = makeVar('MY_KEY', 'my_val')
    render(<VarDetail {...defaultProps} selectedVar={v} clipboardClearSeconds={10} />)
    const copyValueBtn = screen.getByRole('button', { name: /Copy value/i })
    await act(async () => { copyValueBtn.click() })
    expect(writeText).toHaveBeenCalledWith('my_val')
    await act(async () => { vi.advanceTimersByTime(10000) })
    expect(writeText).toHaveBeenCalledWith('')
    vi.useRealTimers()
  })
})
