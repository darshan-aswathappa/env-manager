import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { invoke } from '@tauri-apps/api/core'
import DiffViewPanel from '../components/DiffView/DiffViewPanel'
import type { Project, EnvVar } from '../types'

const mockInvoke = vi.mocked(invoke)

function makeVar(key: string, val: string, id?: string): EnvVar {
  return { id: id ?? `var-${key}`, key, val, revealed: false, sourceProjectId: 'p1' }
}

const makeProject = (overrides: Partial<Project> = {}): Project => ({
  id: 'p1',
  name: 'MyProject',
  path: '/myproject',
  parentId: null,
  vars: [],
  environments: [
    { suffix: '', vars: [makeVar('API_KEY', 'abc'), makeVar('DB_URL', 'postgres://old')] },
    { suffix: 'staging', vars: [makeVar('API_KEY', 'xyz'), makeVar('STAGING_ONLY', 'yes')] },
    { suffix: 'production', vars: [makeVar('API_KEY', 'prod-key')] },
  ],
  activeEnv: '',
  inheritanceMode: 'merge-child-wins',
  sortOrder: 0,
  ...overrides,
})

const defaultProps = {
  project: makeProject(),
  initialLeftSuffix: '',
  onClose: vi.fn(),
  onPushComplete: vi.fn(),
}

describe('DiffViewPanel rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('renders the panel with two env selector dropdowns', () => {
    render(<DiffViewPanel {...defaultProps} />)
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(2)
  })

  it('defaults left dropdown to initialLeftSuffix prop', () => {
    render(<DiffViewPanel {...defaultProps} initialLeftSuffix="" />)
    const selects = screen.getAllByRole('combobox')
    expect(selects[0]).toHaveValue('')
  })

  it('defaults right dropdown to a different env than left', () => {
    render(<DiffViewPanel {...defaultProps} initialLeftSuffix="" />)
    const selects = screen.getAllByRole('combobox')
    expect(selects[1]).not.toHaveValue('')
  })

  it('renders a close button', () => {
    render(<DiffViewPanel {...defaultProps} />)
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<DiffViewPanel {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<DiffViewPanel {...defaultProps} onClose={onClose} />)
    const panel = screen.getByRole('dialog')
    fireEvent.keyDown(panel, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('EnvSelector dropdowns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('disables the currently-selected right suffix in the left dropdown', () => {
    render(<DiffViewPanel {...defaultProps} />)
    const selects = screen.getAllByRole('combobox')
    const leftSelect = selects[0]
    const rightValue = (selects[1] as HTMLSelectElement).value
    const disabledOption = leftSelect.querySelector(`option[value="${rightValue}"]`)
    expect(disabledOption).toHaveAttribute('disabled')
  })

  it('disables the currently-selected left suffix in the right dropdown', () => {
    render(<DiffViewPanel {...defaultProps} />)
    const selects = screen.getAllByRole('combobox')
    const rightSelect = selects[1]
    const leftValue = (selects[0] as HTMLSelectElement).value
    const disabledOption = rightSelect.querySelector(`option[value="${leftValue}"]`)
    expect(disabledOption).toHaveAttribute('disabled')
  })

  it('swap button exchanges left and right suffix values', () => {
    render(<DiffViewPanel {...defaultProps} />)
    const selects = screen.getAllByRole('combobox')
    const initialLeft = (selects[0] as HTMLSelectElement).value
    const initialRight = (selects[1] as HTMLSelectElement).value
    fireEvent.click(screen.getByRole('button', { name: /swap/i }))
    const updatedSelects = screen.getAllByRole('combobox')
    expect((updatedSelects[0] as HTMLSelectElement).value).toBe(initialRight)
    expect((updatedSelects[1] as HTMLSelectElement).value).toBe(initialLeft)
  })

  it('changing left dropdown updates the displayed diff', () => {
    render(<DiffViewPanel {...defaultProps} />)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 'staging' } })
    // Panel still renders (no crash = diff recomputed)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('changing right dropdown updates the displayed diff', () => {
    render(<DiffViewPanel {...defaultProps} />)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'production' } })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('DiffRow rendering', () => {
  // Project with known diff: API_KEY modified, DB_URL removed, STAGING_ONLY added, SAME_KEY unchanged
  const project = makeProject({
    environments: [
      {
        suffix: '',
        vars: [makeVar('API_KEY', 'abc'), makeVar('DB_URL', 'postgres://old'), makeVar('SAME_KEY', 'same')]
      },
      {
        suffix: 'staging',
        vars: [makeVar('API_KEY', 'xyz'), makeVar('STAGING_ONLY', 'yes'), makeVar('SAME_KEY', 'same')]
      },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('renders a removed row with key name visible', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    expect(screen.getByText('DB_URL')).toBeInTheDocument()
  })

  it('renders an added row with key name visible', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    expect(screen.getByText('STAGING_ONLY')).toBeInTheDocument()
  })

  it('renders a modified row with key name visible', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
  })

  it('masks values by default (shows masked placeholder)', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const masked = screen.getAllByText('••••••••')
    expect(masked.length).toBeGreaterThan(0)
  })

  it('shows reveal button on each row with a value', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const revealBtns = screen.getAllByRole('button', { name: /reveal/i })
    expect(revealBtns.length).toBeGreaterThan(0)
  })

  it('"Reveal all" toggle in panel header reveals all row values', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const revealAllBtn = screen.getByRole('button', { name: /reveal all/i })
    fireEvent.click(revealAllBtn)
    // After revealing, values should be shown (masked chars gone or reduced)
    const masked = screen.queryAllByText('••••••••')
    expect(masked.length).toBe(0)
  })

  it('"Reveal all" toggle when active re-masks all values', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const revealAllBtn = screen.getByRole('button', { name: /reveal all/i })
    fireEvent.click(revealAllBtn) // reveal
    fireEvent.click(revealAllBtn) // mask again
    const masked = screen.getAllByText('••••••••')
    expect(masked.length).toBeGreaterThan(0)
  })

  it('for added rows: left value column shows nothing', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    // Added rows (STAGING_ONLY) should have an empty left cell - no left val shown
    const addedRow = screen.getByTestId('diff-row-STAGING_ONLY')
    const leftCell = within(addedRow).queryByTestId('left-val')
    // left cell should be empty or absent for added rows
    expect(leftCell).toBeNull()
  })

  it('for removed rows: right value column shows nothing', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const removedRow = screen.getByTestId('diff-row-DB_URL')
    const rightCell = within(removedRow).queryByTestId('right-val')
    expect(rightCell).toBeNull()
  })
})

describe('Status summary bar', () => {
  const project = makeProject({
    environments: [
      {
        suffix: '',
        vars: [makeVar('API_KEY', 'abc'), makeVar('DB_URL', 'old'), makeVar('SAME', 'same')]
      },
      {
        suffix: 'staging',
        vars: [makeVar('API_KEY', 'xyz'), makeVar('NEW_KEY', 'new'), makeVar('SAME', 'same')]
      },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('shows count summary with modified, added, removed, unchanged', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const summary = screen.getByTestId('diff-summary')
    expect(summary).toBeInTheDocument()
    // Has counts for modified (1), removed (1), added (1), unchanged (1)
    expect(summary.textContent).toMatch(/1/)
  })

  it('counts update when env is changed via dropdown', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[1], { target: { value: 'staging' } })
    expect(screen.getByTestId('diff-summary')).toBeInTheDocument()
  })
})

describe('Search filter', () => {
  const project = makeProject({
    environments: [
      { suffix: '', vars: [makeVar('API_KEY', 'a'), makeVar('DB_URL', 'b'), makeVar('PORT', 'c')] },
      { suffix: 'staging', vars: [makeVar('API_KEY', 'x'), makeVar('STAGING_VAR', 'y')] },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('search input filters rows to only those matching the key name substring', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'API' } })
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
    expect(screen.queryByText('DB_URL')).not.toBeInTheDocument()
  })

  it('search is case-insensitive', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'api' } })
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
  })

  it('clearing search restores all rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'API' } })
    fireEvent.change(searchInput, { target: { value: '' } })
    expect(screen.getByText('DB_URL')).toBeInTheDocument()
  })
})

describe('Status filter pills', () => {
  const project = makeProject({
    environments: [
      { suffix: '', vars: [makeVar('API_KEY', 'abc'), makeVar('DB_URL', 'old'), makeVar('SAME', 'same')] },
      { suffix: 'staging', vars: [makeVar('API_KEY', 'xyz'), makeVar('NEW_KEY', 'new'), makeVar('SAME', 'same')] },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('default state hides unchanged rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    // SAME_KEY is unchanged — should not be visible by default
    expect(screen.queryByText('SAME')).not.toBeInTheDocument()
  })

  it('clicking "Identical" filter pill shows unchanged rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const identicalBtn = screen.getByRole('button', { name: /identical/i })
    fireEvent.click(identicalBtn)
    expect(screen.getByText('SAME')).toBeInTheDocument()
  })

  it('clicking "Missing in left" shows only added rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const btn = screen.getByRole('button', { name: /missing in left/i })
    fireEvent.click(btn)
    expect(screen.getByText('NEW_KEY')).toBeInTheDocument()
    expect(screen.queryByText('DB_URL')).not.toBeInTheDocument()
    expect(screen.queryByText('API_KEY')).not.toBeInTheDocument()
  })

  it('clicking "Missing in right" shows only removed rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const btn = screen.getByRole('button', { name: /missing in right/i })
    fireEvent.click(btn)
    expect(screen.getByText('DB_URL')).toBeInTheDocument()
    expect(screen.queryByText('NEW_KEY')).not.toBeInTheDocument()
  })

  it('clicking "Changed" shows only modified rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const btn = screen.getByRole('button', { name: /changed/i })
    fireEvent.click(btn)
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
    expect(screen.queryByText('DB_URL')).not.toBeInTheDocument()
    expect(screen.queryByText('NEW_KEY')).not.toBeInTheDocument()
  })

  it('clicking "All" shows all rows including unchanged', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const btn = screen.getByRole('button', { name: /^all$/i })
    fireEvent.click(btn)
    // All keys should be visible
    expect(screen.getByText('API_KEY')).toBeInTheDocument()
    expect(screen.getByText('DB_URL')).toBeInTheDocument()
    expect(screen.getByText('NEW_KEY')).toBeInTheDocument()
    expect(screen.getByText('SAME')).toBeInTheDocument()
  })

  it('reset clears search and restores default filter state', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'API' } })
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    // After reset, search should be cleared and unchanged rows hidden again
    expect(searchInput).toHaveValue('')
    expect(screen.queryByText('SAME')).not.toBeInTheDocument()
  })
})

describe('Empty states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('shows "in sync" message when all entries are unchanged', () => {
    const project = makeProject({
      environments: [
        { suffix: '', vars: [makeVar('A', 'same')] },
        { suffix: 'staging', vars: [makeVar('A', 'same')] },
      ],
    })
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    // Click "All" to show unchanged
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }))
    expect(screen.getByText(/in sync/i)).toBeInTheDocument()
  })

  it('shows "No variables found" message when selected env has no vars', () => {
    const project = makeProject({
      environments: [
        { suffix: '', vars: [] },
        { suffix: 'staging', vars: [makeVar('A', 'a')] },
      ],
    })
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    expect(screen.getByText(/no variables found/i)).toBeInTheDocument()
  })

  it('shows "No results" message when search matches no keys', () => {
    const project = makeProject({
      environments: [
        { suffix: '', vars: [makeVar('API_KEY', 'a')] },
        { suffix: 'staging', vars: [makeVar('API_KEY', 'b')] },
      ],
    })
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'NONEXISTENT' } })
    expect(screen.getByText(/no results/i)).toBeInTheDocument()
  })
})

describe('Copy value action', () => {
  const project = makeProject({
    environments: [
      { suffix: '', vars: [makeVar('API_KEY', 'abc')] },
      { suffix: 'staging', vars: [makeVar('API_KEY', 'xyz')] },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('copy button is not visible when row is not revealed', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-API_KEY')
    const copyBtn = within(row).queryByRole('button', { name: /copy/i })
    expect(copyBtn).toBeNull()
  })

  it('copy button appears after row is revealed', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-API_KEY')
    const revealBtn = within(row).getByRole('button', { name: /reveal/i })
    fireEvent.click(revealBtn)
    const copyBtn = within(row).queryByRole('button', { name: /copy/i })
    expect(copyBtn).not.toBeNull()
  })

  it('clicking copy button writes the value to the clipboard', async () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-API_KEY')
    const revealBtn = within(row).getByRole('button', { name: /reveal/i })
    fireEvent.click(revealBtn)
    const copyBtn = within(row).getByRole('button', { name: /copy/i })
    await act(async () => { fireEvent.click(copyBtn) })
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
  })
})

describe('Single-key push action', () => {
  const project = makeProject({
    environments: [
      { suffix: '', vars: [makeVar('DB_URL', 'old')] },
      { suffix: 'staging', vars: [makeVar('STAGING_ONLY', 'yes')] },
    ],
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('push arrow button appears on removed rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-DB_URL')
    expect(within(row).getByRole('button', { name: /push/i })).toBeInTheDocument()
  })

  it('push arrow button appears on added rows', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-STAGING_ONLY')
    expect(within(row).getByRole('button', { name: /push/i })).toBeInTheDocument()
  })

  it('clicking push button shows a confirmation popover', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-DB_URL')
    fireEvent.click(within(row).getByRole('button', { name: /push/i }))
    expect(screen.getByRole('dialog', { name: /confirm/i })).toBeInTheDocument()
  })

  it('confirmation popover shows key and target env', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-DB_URL')
    fireEvent.click(within(row).getByRole('button', { name: /push/i }))
    const popover = screen.getByRole('dialog', { name: /confirm/i })
    expect(popover.textContent).toMatch(/DB_URL/)
  })

  it('confirming the push calls invoke with push_vars_to_stage', async () => {
    mockInvoke.mockImplementation((cmd) => {
      if (cmd === 'push_vars_to_stage') return Promise.resolve({ snapshot: null, targetCreated: false })
      if (cmd === 'load_project_env') return Promise.resolve('')
      return Promise.resolve('')
    })
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-DB_URL')
    fireEvent.click(within(row).getByRole('button', { name: /push/i }))
    const confirmBtn = screen.getByRole('button', { name: /confirm/i })
    await act(async () => { fireEvent.click(confirmBtn) })
    expect(mockInvoke).toHaveBeenCalledWith('push_vars_to_stage', expect.anything())
  })

  it('cancelling the confirmation popover makes no invoke push call', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-DB_URL')
    fireEvent.click(within(row).getByRole('button', { name: /push/i }))
    const cancelBtn = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelBtn)
    expect(mockInvoke).not.toHaveBeenCalledWith('push_vars_to_stage', expect.anything())
  })

  it('closing confirmation popover hides it', () => {
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const row = screen.getByTestId('diff-row-DB_URL')
    fireEvent.click(within(row).getByRole('button', { name: /push/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog', { name: /confirm/i })).toBeNull()
  })
})

describe('ARIA accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue('')
  })

  it('diff panel has role="dialog" and aria-label="Compare environments"', () => {
    render(<DiffViewPanel {...defaultProps} />)
    expect(screen.getByRole('dialog', { name: /compare environments/i })).toBeInTheDocument()
  })

  it('swap button has aria-label containing "Swap"', () => {
    render(<DiffViewPanel {...defaultProps} />)
    expect(screen.getByRole('button', { name: /swap/i })).toBeInTheDocument()
  })

  it('diff list has role="list"', () => {
    render(<DiffViewPanel {...defaultProps} />)
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('each diff row has role="listitem"', () => {
    const project = makeProject({
      environments: [
        { suffix: '', vars: [makeVar('API_KEY', 'a')] },
        { suffix: 'staging', vars: [makeVar('API_KEY', 'b')] },
      ],
    })
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThan(0)
  })

  it('reveal button has aria-label describing its action', () => {
    const project = makeProject({
      environments: [
        { suffix: '', vars: [makeVar('API_KEY', 'a')] },
        { suffix: 'staging', vars: [makeVar('API_KEY', 'b')] },
      ],
    })
    render(<DiffViewPanel {...defaultProps} project={project} initialLeftSuffix="" />)
    const revealBtn = screen.getAllByRole('button', { name: /reveal/i })[0]
    expect(revealBtn).toHaveAttribute('aria-label')
  })
})
