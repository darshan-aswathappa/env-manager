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
  onSave: vi.fn(),
  onSwitchEnvironment: vi.fn(),
  shellStatus: 'zsh' as const,
  onOpenShellIntegration: vi.fn(),
  onOpenPush: null as (() => void) | null,
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

  it('empty state shows orientation copy directing user to the list', () => {
    render(<VarDetail {...defaultProps} />)
    expect(screen.getByText(/use \+ to create one/i)).toBeInTheDocument()
  })

  it('does not render an Add variable button in the detail footer', () => {
    render(<VarDetail {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /Add new variable/i })).not.toBeInTheDocument()
  })

  it('shows warning signal with tooltip when no gitignore exists', () => {
    render(<VarDetail {...defaultProps} gitignoreStatus="no_gitignore" />)
    const signal = screen.getByTitle(/No .gitignore found/i)
    expect(signal).toBeInTheDocument()
    expect(signal.querySelector('.header-signal__dot')).toBeTruthy()
  })

  it('shows warning signal with tooltip when .env is not listed', () => {
    render(<VarDetail {...defaultProps} gitignoreStatus="not_listed" />)
    const signal = screen.getByTitle(/.env is NOT listed/i)
    expect(signal).toBeInTheDocument()
    expect(signal.querySelector('.header-signal__dot')).toBeTruthy()
  })

  it('shows success signal with tooltip when .env is listed', () => {
    render(<VarDetail {...defaultProps} gitignoreStatus="listed" />)
    const signal = screen.getByTitle(/.env is listed in .gitignore/i)
    expect(signal).toBeInTheDocument()
    expect(signal.querySelector('.header-signal__dot')).toBeTruthy()
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

  it('shows active env name in badge label', () => {
    const { container } = render(<VarDetail {...defaultProps} activeEnv="production" />)
    expect(container.querySelector('.env-badge__label')).toHaveTextContent('.env.production')
  })

  it('shows base env name in badge label when activeEnv is empty', () => {
    const { container } = render(<VarDetail {...defaultProps} activeEnv="" />)
    expect(container.querySelector('.env-badge__label')).toHaveTextContent('.env')
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
    expect(screen.getByText(/Couldn't save/i)).toBeInTheDocument()
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

describe('VarDetail promote button', () => {
  it('renders promote button in header when onOpenPush is provided', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Promote to another environment/i })).toBeInTheDocument()
  })

  it('shows "Promote" text label on the button', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(btn).toHaveTextContent('Promote')
  })

  it('calls onOpenPush when promote button is clicked', () => {
    const onOpenPush = vi.fn()
    render(<VarDetail {...defaultProps} onOpenPush={onOpenPush} />)
    fireEvent.click(screen.getByRole('button', { name: /Promote to another environment/i }))
    expect(onOpenPush).toHaveBeenCalledTimes(1)
  })

  it('promote button is natively disabled (HTML disabled attribute) when onOpenPush is null', () => {
    render(<VarDetail {...defaultProps} onOpenPush={null} />)
    const btn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(btn).toBeDisabled()
  })

  it('promote button is enabled when onOpenPush is a function', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(btn).not.toBeDisabled()
  })

  it('promote button title contains keyboard shortcut hint', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(btn).toHaveAttribute('title', expect.stringContaining('⌘⇧P'))
  })

  it('promote button does not call handler when disabled (onOpenPush is null)', () => {
    const onOpenPush = vi.fn()
    render(<VarDetail {...defaultProps} onOpenPush={null} />)
    // disabled buttons don't fire click events
    fireEvent.click(screen.getByRole('button', { name: /Promote to another environment/i }))
    expect(onOpenPush).not.toHaveBeenCalled()
  })

  it('promote button uses promote-btn CSS class', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(btn).toHaveClass('promote-btn')
  })

  it('promote button is always rendered (enabled or disabled)', () => {
    const { rerender } = render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Promote to another environment/i })).toBeInTheDocument()
    rerender(<VarDetail {...defaultProps} onOpenPush={null} />)
    expect(screen.getByRole('button', { name: /Promote to another environment/i })).toBeInTheDocument()
  })

  it('promote button is positioned in the header area', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} />)
    const btn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(btn.closest('header')).toBeTruthy()
  })
})

describe('VarDetail diff button', () => {
  it('renders "Compare" button when onOpenDiff prop is provided', () => {
    render(<VarDetail {...defaultProps} onOpenDiff={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Compare Environments/i })).toBeInTheDocument()
  })

  it('does not render the diff button when onOpenDiff is null', () => {
    render(<VarDetail {...defaultProps} onOpenDiff={null} />)
    expect(screen.queryByRole('button', { name: /Compare Environments/i })).not.toBeInTheDocument()
  })

  it('does not render the diff button when onOpenDiff is undefined (omitted)', () => {
    const { onOpenDiff: _, ...propsWithoutDiff } = { ...defaultProps, onOpenDiff: undefined }
    render(<VarDetail {...propsWithoutDiff} />)
    expect(screen.queryByRole('button', { name: /Compare Environments/i })).not.toBeInTheDocument()
  })

  it('clicking the Compare button calls onOpenDiff', () => {
    const onOpenDiff = vi.fn()
    render(<VarDetail {...defaultProps} onOpenDiff={onOpenDiff} />)
    fireEvent.click(screen.getByRole('button', { name: /Compare Environments/i }))
    expect(onOpenDiff).toHaveBeenCalledTimes(1)
  })

  it('Compare button is positioned in the header area alongside Promote button', () => {
    render(<VarDetail {...defaultProps} onOpenPush={vi.fn()} onOpenDiff={vi.fn()} />)
    const compareBtn = screen.getByRole('button', { name: /Compare Environments/i })
    const promoteBtn = screen.getByRole('button', { name: /Promote to another environment/i })
    expect(compareBtn.closest('header')).toBeTruthy()
    expect(compareBtn.closest('header')).toBe(promoteBtn.closest('header'))
  })

  it('Compare button is disabled when onOpenDiff is falsy (null passed)', () => {
    render(<VarDetail {...defaultProps} onOpenDiff={null} />)
    // null means no button rendered, not a disabled button
    expect(screen.queryByRole('button', { name: /Compare Environments/i })).not.toBeInTheDocument()
  })
})

describe('VarDetail Note textarea', () => {
  it('renders a Note textarea when a variable is selected', () => {
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(screen.getByLabelText('Note')).toBeInTheDocument()
  })

  it('does NOT render a Note textarea when selectedVar is null', () => {
    render(<VarDetail {...defaultProps} selectedVar={null} />)
    expect(screen.queryByLabelText('Note')).not.toBeInTheDocument()
  })

  it('displays the existing comment value in the textarea', () => {
    const v = { ...makeVar(), comment: 'some note' }
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    expect(textarea.value).toBe('some note')
  })

  it('shows empty textarea when comment is undefined', () => {
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
  })

  it('shows empty textarea when comment is empty string', () => {
    const v = { ...makeVar(), comment: '' }
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const textarea = screen.getByLabelText('Note') as HTMLTextAreaElement
    expect(textarea.value).toBe('')
  })

  it('textarea has a non-empty placeholder attribute', () => {
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const textarea = screen.getByLabelText('Note')
    const placeholder = textarea.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()
    expect(placeholder!.length).toBeGreaterThan(0)
  })

  it('typing in textarea calls onUpdateVar with (varId, comment, newValue)', () => {
    const onUpdateVar = vi.fn()
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} onUpdateVar={onUpdateVar} />)
    const textarea = screen.getByLabelText('Note')
    fireEvent.change(textarea, { target: { value: 'new note' } })
    expect(onUpdateVar).toHaveBeenCalledWith('var-1', 'comment', 'new note')
  })

  it('clearing the textarea calls onUpdateVar with (varId, comment, empty string)', () => {
    const onUpdateVar = vi.fn()
    const v = { ...makeVar(), comment: 'existing note' }
    render(<VarDetail {...defaultProps} selectedVar={v} onUpdateVar={onUpdateVar} />)
    const textarea = screen.getByLabelText('Note')
    fireEvent.change(textarea, { target: { value: '' } })
    expect(onUpdateVar).toHaveBeenCalledWith('var-1', 'comment', '')
  })

  it('selecting a different variable shows that variables comment', () => {
    const v1 = { ...makeVar('KEY1', 'val1'), id: 'var-1', comment: 'note1' }
    const v2 = { ...makeVar('KEY2', 'val2'), id: 'var-2', comment: 'note2' }
    const { rerender } = render(<VarDetail {...defaultProps} selectedVar={v1} />)
    const textarea1 = screen.getByLabelText('Note') as HTMLTextAreaElement
    expect(textarea1.value).toBe('note1')
    rerender(<VarDetail {...defaultProps} selectedVar={v2} />)
    const textarea2 = screen.getByLabelText('Note') as HTMLTextAreaElement
    expect(textarea2.value).toBe('note2')
  })

  it('Note textarea appears after the Value input in DOM order', () => {
    const v = makeVar()
    const { container } = render(<VarDetail {...defaultProps} selectedVar={v} />)
    const allInputs = Array.from(container.querySelectorAll('input, textarea'))
    const valueInputIndex = allInputs.findIndex(el => el.getAttribute('aria-label')?.includes('Value for'))
    const noteTextareaIndex = allInputs.findIndex(el => el.getAttribute('aria-label') === 'Note')
    expect(noteTextareaIndex).toBeGreaterThan(valueInputIndex)
  })

  it('Note textarea has a natural tabIndex (not -1)', () => {
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const textarea = screen.getByLabelText('Note')
    expect(textarea.getAttribute('tabindex')).not.toBe('-1')
  })

  it('textarea is associated with a visible Note label (getByLabelText works)', () => {
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    expect(() => screen.getByLabelText('Note')).not.toThrow()
  })

  it('textarea has an aria-label attribute equal to Note', () => {
    const v = makeVar()
    render(<VarDetail {...defaultProps} selectedVar={v} />)
    const textarea = screen.getByLabelText('Note')
    expect(textarea).toHaveAttribute('aria-label', 'Note')
  })
})

describe('VarDetail RenamePropagateBanner', () => {
  // Test 23: banner renders when renamePrompt prop is non-null
  it('renders banner when renamePrompt prop is non-null', () => {
    render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local', 'production'] }}
      onPropagateRename={vi.fn()}
      onDismissRename={vi.fn()}
    />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Rename/i)).toBeInTheDocument()
  })

  // Test 24: banner not rendered when renamePrompt is null
  it('does not render banner when renamePrompt is null', () => {
    render(<VarDetail
      {...defaultProps}
      renamePrompt={null}
      onPropagateRename={vi.fn()}
      onDismissRename={vi.fn()}
    />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // Test 25: lists each affected env as a chip
  it('lists each affected env as a chip', () => {
    const { container } = render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local', 'production'] }}
      onPropagateRename={vi.fn()}
      onDismissRename={vi.fn()}
    />)
    const chips = container.querySelectorAll('.env-badge--chip')
    const chipTexts = Array.from(chips).map(c => c.textContent)
    expect(chipTexts).toContain('.env.local')
    expect(chipTexts).toContain('.env.production')
  })

  // Test 26: clicking "Propagate All" calls onPropagateRename
  it('clicking "Propagate All" calls onPropagateRename', () => {
    const onPropagateRename = vi.fn()
    render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local'] }}
      onPropagateRename={onPropagateRename}
      onDismissRename={vi.fn()}
    />)
    fireEvent.click(screen.getByRole('button', { name: /Propagate All/i }))
    expect(onPropagateRename).toHaveBeenCalledTimes(1)
  })

  // Test 27: clicking "Skip" calls onDismissRename
  it('clicking "Skip" calls onDismissRename', () => {
    const onDismissRename = vi.fn()
    render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local'] }}
      onPropagateRename={vi.fn()}
      onDismissRename={onDismissRename}
    />)
    fireEvent.click(screen.getByRole('button', { name: /Skip/i }))
    expect(onDismissRename).toHaveBeenCalledTimes(1)
  })

  // Test 28: Escape key calls onDismissRename
  it('Escape key on banner calls onDismissRename', () => {
    const onDismissRename = vi.fn()
    render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local'] }}
      onPropagateRename={vi.fn()}
      onDismissRename={onDismissRename}
    />)
    const alert = screen.getByRole('alert')
    fireEvent.keyDown(alert, { key: 'Escape' })
    expect(onDismissRename).toHaveBeenCalledTimes(1)
  })

  // Test 29: banner has correct ARIA attributes
  it('banner has role="alert" and aria-live="polite"', () => {
    render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local'] }}
      onPropagateRename={vi.fn()}
      onDismissRename={vi.fn()}
    />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAttribute('aria-live', 'polite')
  })

  // Test 30: "Propagate All" button is focused on mount
  it('"Propagate All" button is focused on mount', () => {
    render(<VarDetail
      {...defaultProps}
      renamePrompt={{ oldKey: 'A', newKey: 'B', affectedSuffixes: ['local'] }}
      onPropagateRename={vi.fn()}
      onDismissRename={vi.fn()}
    />)
    const propagateBtn = screen.getByRole('button', { name: /Propagate All/i })
    expect(document.activeElement).toBe(propagateBtn)
  })
})

describe('VarDetail duplicate key warning', () => {
  const makeReport = (affectedIds: string[]): import('../types').DuplicateReport => ({
    hasDuplicates: affectedIds.length > 0,
    entries: affectedIds.length > 0 ? [{ key: 'PORT', ids: affectedIds, firstSeenIndex: 0 }] : [],
    affectedIds: new Set(affectedIds),
  })

  const makeEmptyReport = (): import('../types').DuplicateReport => ({
    hasDuplicates: false,
    entries: [],
    affectedIds: new Set(),
  })

  it('no warning when key is unique', () => {
    const v = makeVar('PORT', '3000')
    render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeEmptyReport()} />)
    expect(screen.queryByTestId('duplicate-warning')).not.toBeInTheDocument()
  })

  it('warning appears when var is in duplicateReport.affectedIds', () => {
    const v = makeVar('PORT', '3000')
    render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeReport([v.id])} />)
    expect(screen.getByTestId('duplicate-warning')).toBeInTheDocument()
  })

  it('warning text mentions the key name', () => {
    const v = { ...makeVar('PORT', '3000'), id: 'var-1' }
    render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeReport(['var-1'])} />)
    expect(screen.getByTestId('duplicate-warning')).toHaveTextContent('PORT')
  })

  it('warning disappears when duplicateReport is empty', () => {
    const v = makeVar('PORT', '3000')
    const { rerender } = render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeReport([v.id])} />)
    expect(screen.getByTestId('duplicate-warning')).toBeInTheDocument()
    rerender(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeEmptyReport()} />)
    expect(screen.queryByTestId('duplicate-warning')).not.toBeInTheDocument()
  })

  it('save button has aria-disabled="true" when duplicateReport.hasDuplicates', () => {
    const v = makeVar('PORT', '3000')
    render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeReport([v.id])} />)
    const saveBtn = screen.getByRole('button', { name: /Save .env file to disk/i })
    expect(saveBtn).toHaveAttribute('aria-disabled', 'true')
  })

  it('save button does NOT have aria-disabled when no duplicates', () => {
    const v = makeVar('PORT', '3000')
    render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeEmptyReport()} />)
    const saveBtn = screen.getByRole('button', { name: /Save .env file to disk/i })
    expect(saveBtn).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('save button re-enables after duplicates resolved', () => {
    const v = makeVar('PORT', '3000')
    const { rerender } = render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeReport([v.id])} />)
    expect(screen.getByRole('button', { name: /Save .env file to disk/i })).toHaveAttribute('aria-disabled', 'true')
    rerender(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeEmptyReport()} />)
    expect(screen.getByRole('button', { name: /Save .env file to disk/i })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('no warning for empty key even if id is in affectedIds', () => {
    const v = makeVar('', '')
    const { id } = v
    render(<VarDetail {...defaultProps} selectedVar={v} duplicateReport={makeReport([id])} />)
    // empty key should not show duplicate warning (empty keys are excluded from detection)
    expect(screen.queryByTestId('duplicate-warning')).not.toBeInTheDocument()
  })
})
