import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import SettingsPanel from '../components/Settings'
import type { AppSettings } from '../types'

vi.mock('../lib/envFile', () => ({
  getAppDataDir: vi.fn().mockResolvedValue('/home/user/.envvault'),
}))

const makeSettings = (overrides?: Partial<AppSettings>): AppSettings => ({
  defaultShell: 'zsh',
  defaultInheritanceMode: 'merge-child-wins',
  autoMaskMinutes: 5,
  clipboardClearSeconds: 30,
  ...overrides,
})

const defaultProps = {
  settings: makeSettings(),
  onChange: vi.fn(),
  onResetOnboarding: vi.fn(),
  onClearAllData: vi.fn(),
  onOpenShellIntegration: vi.fn(),
}

function renderSettings(overrides?: Partial<typeof defaultProps>) {
  return render(<SettingsPanel {...defaultProps} {...overrides} />)
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Section headings
  it('renders section headings', async () => {
    await act(async () => { renderSettings() })
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Inheritance')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
    expect(screen.getByText('Data')).toBeInTheDocument()
    expect(screen.getByText('Danger Zone')).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
  })

  // 2. Shows current inheritance mode in the selector
  it('shows current inheritance mode in the selector', async () => {
    await act(async () => { renderSettings() })
    const select = screen.getByLabelText('Default inheritance mode') as HTMLSelectElement
    expect(select.value).toBe('merge-child-wins')
  })

  it('shows merge-parent-wins when set', async () => {
    await act(async () => {
      renderSettings({ settings: makeSettings({ defaultInheritanceMode: 'merge-parent-wins' }) })
    })
    const select = screen.getByLabelText('Default inheritance mode') as HTMLSelectElement
    expect(select.value).toBe('merge-parent-wins')
  })

  // 3. Calls onChange when inheritance mode is changed
  it('calls onChange when inheritance mode is changed', async () => {
    const onChange = vi.fn()
    await act(async () => { renderSettings({ onChange }) })
    const select = screen.getByLabelText('Default inheritance mode')
    fireEvent.change(select, { target: { value: 'isolated' } })
    expect(onChange).toHaveBeenCalledWith({
      ...makeSettings(),
      defaultInheritanceMode: 'isolated',
    })
  })

  // 4. Shows auto-mask timer value
  it('shows auto-mask timer value', async () => {
    await act(async () => { renderSettings() })
    const input = screen.getByLabelText('Auto-mask timeout in minutes') as HTMLInputElement
    expect(input.value).toBe('5')
  })

  // 5. Calls onChange when auto-mask is changed
  it('calls onChange when auto-mask is changed', async () => {
    const onChange = vi.fn()
    await act(async () => { renderSettings({ onChange }) })
    const input = screen.getByLabelText('Auto-mask timeout in minutes')
    fireEvent.change(input, { target: { value: '10' } })
    expect(onChange).toHaveBeenCalledWith({
      ...makeSettings(),
      autoMaskMinutes: 10,
    })
  })

  // 6. Shows clipboard clear timer value
  it('shows clipboard clear timer value', async () => {
    await act(async () => { renderSettings() })
    const input = screen.getByLabelText('Clipboard clear delay in seconds') as HTMLInputElement
    expect(input.value).toBe('30')
  })

  // 7. Calls onChange when clipboard timer is changed
  it('calls onChange when clipboard timer is changed', async () => {
    const onChange = vi.fn()
    await act(async () => { renderSettings({ onChange }) })
    const input = screen.getByLabelText('Clipboard clear delay in seconds')
    fireEvent.change(input, { target: { value: '60' } })
    expect(onChange).toHaveBeenCalledWith({
      ...makeSettings(),
      clipboardClearSeconds: 60,
    })
  })

  // 8. Reset onboarding button calls onResetOnboarding (two-click confirm)
  it('reset onboarding button shows confirm then calls onResetOnboarding', async () => {
    const onResetOnboarding = vi.fn()
    await act(async () => { renderSettings({ onResetOnboarding }) })

    const resetBtn = screen.getByRole('button', { name: 'Reset' })
    expect(resetBtn).toBeInTheDocument()

    // First click shows confirmation
    fireEvent.click(resetBtn)
    expect(onResetOnboarding).not.toHaveBeenCalled()
    expect(screen.getByText('Click again to confirm')).toBeInTheDocument()

    // Second click calls the handler
    fireEvent.click(screen.getByText('Click again to confirm'))
    expect(onResetOnboarding).toHaveBeenCalledTimes(1)
  })

  // 9. Clear all data button exists
  it('clear all data button exists', async () => {
    await act(async () => { renderSettings() })
    expect(screen.getByRole('button', { name: 'Clear all data' })).toBeInTheDocument()
  })

  // 10. Clear all data shows confirmation before calling onClearAllData
  it('clear all data shows confirmation dialog', async () => {
    const onClearAllData = vi.fn()
    await act(async () => { renderSettings({ onClearAllData }) })

    // Click clear all data to show confirmation
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }))

    // Confirmation UI appears
    expect(screen.getByLabelText('Type RESET to confirm')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled()

    // Type RESET to enable the button
    const confirmInput = screen.getByLabelText('Type RESET to confirm')
    fireEvent.change(confirmInput, { target: { value: 'RESET' } })
    expect(screen.getByRole('button', { name: 'Delete everything' })).not.toBeDisabled()

    // Click delete everything
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }))
    expect(onClearAllData).toHaveBeenCalledTimes(1)
  })

  it('clear all data cancel button hides confirmation', async () => {
    await act(async () => { renderSettings() })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }))
    expect(screen.getByLabelText('Type RESET to confirm')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByLabelText('Type RESET to confirm')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear all data' })).toBeInTheDocument()
  })

  // 12. Shows app data directory section
  it('shows app data directory', async () => {
    await act(async () => { renderSettings() })
    expect(screen.getByText('App data directory')).toBeInTheDocument()
    expect(screen.getByText('/home/user/.envvault')).toBeInTheDocument()
  })

  it('shows copy path button when app data dir is loaded', async () => {
    await act(async () => { renderSettings() })
    expect(screen.getByLabelText('Copy path')).toBeInTheDocument()
  })

  // 13. Renders version info in About section
  it('renders version info in About section', async () => {
    await act(async () => { renderSettings() })
    expect(screen.getByText('.envVault')).toBeInTheDocument()
    expect(screen.getByText('v1.0.1')).toBeInTheDocument()
  })

  // Auto-mask clamps to 0 for negative values
  it('clamps auto-mask to 0 for empty input', async () => {
    const onChange = vi.fn()
    await act(async () => { renderSettings({ onChange }) })
    const input = screen.getByLabelText('Auto-mask timeout in minutes')
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({
      ...makeSettings(),
      autoMaskMinutes: 0,
    })
  })

  // Clipboard clamps to 0 for empty input
  it('clamps clipboard clear to 0 for empty input', async () => {
    const onChange = vi.fn()
    await act(async () => { renderSettings({ onChange }) })
    const input = screen.getByLabelText('Clipboard clear delay in seconds')
    fireEvent.change(input, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({
      ...makeSettings(),
      clipboardClearSeconds: 0,
    })
  })

  // Inheritance mode options rendered
  it('renders all three inheritance mode options', async () => {
    await act(async () => { renderSettings() })
    const select = screen.getByLabelText('Default inheritance mode')
    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(3)
    expect(options[0].value).toBe('merge-child-wins')
    expect(options[1].value).toBe('merge-parent-wins')
    expect(options[2].value).toBe('isolated')
  })

  // Delete everything button disabled when input doesn't match
  it('delete everything button disabled with partial input', async () => {
    await act(async () => { renderSettings() })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }))
    const confirmInput = screen.getByLabelText('Type RESET to confirm')
    fireEvent.change(confirmInput, { target: { value: 'RES' } })
    expect(screen.getByRole('button', { name: 'Delete everything' })).toBeDisabled()
  })

  // Case insensitive RESET acceptance
  it('accepts lowercase reset for clear confirmation', async () => {
    await act(async () => { renderSettings() })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all data' }))
    const confirmInput = screen.getByLabelText('Type RESET to confirm')
    fireEvent.change(confirmInput, { target: { value: 'reset' } })
    expect(screen.getByRole('button', { name: 'Delete everything' })).not.toBeDisabled()
  })

  it('copy path button copies app data dir to clipboard', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    await act(async () => { renderSettings() })
    const copyBtn = screen.getByLabelText('Copy path')
    await act(async () => { copyBtn.click() })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/home/user/.envvault')
  })

  it('reset confirm resets on blur', async () => {
    const onResetOnboarding = vi.fn()
    await act(async () => { renderSettings({ onResetOnboarding }) })
    const resetBtn = screen.getByRole('button', { name: 'Reset' })
    fireEvent.click(resetBtn)
    expect(screen.getByText('Click again to confirm')).toBeInTheDocument()
    fireEvent.blur(screen.getByText('Click again to confirm'))
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    expect(onResetOnboarding).not.toHaveBeenCalled()
  })

  it('onOpenShellIntegration prop is accepted without error', async () => {
    const onOpenShellIntegration = vi.fn()
    await act(async () => { renderSettings({ onOpenShellIntegration }) })
    // Shell section is commented out in Settings.tsx — prop is accepted but not wired to UI
    expect(document.body).toBeTruthy()
  })
})
