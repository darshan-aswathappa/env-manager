import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Onboarding from '../components/Onboarding'

// Mock the envFile module (checkShellIntegration)
vi.mock('../lib/envFile', () => ({
  checkShellIntegration: vi.fn(),
  getShellHook: vi.fn().mockResolvedValue('# shell hook'),
}))

// Mock ShellIntegration component to avoid its internal dependencies
vi.mock('../components/ShellIntegration', () => ({
  default: () => <div data-testid="shell-integration-embed">ShellIntegration Mock</div>,
}))

// Mock the logo import
vi.mock('../assets/logo.png', () => ({ default: 'logo.png' }))

import { checkShellIntegration } from '../lib/envFile'

const mockedCheck = vi.mocked(checkShellIntegration)

describe('Onboarding', () => {
  const onComplete = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    onComplete.mockReset()
    mockedCheck.mockReset()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function advanceTransition() {
    // SWAP_MS = 160, then CLEANUP_MS - SWAP_MS = 240
    act(() => { vi.advanceTimersByTime(160) })
    act(() => { vi.advanceTimersByTime(240) })
  }

  // ── Step 1: Welcome ──────────────────────────────

  it('renders the welcome step initially', () => {
    render(<Onboarding onComplete={onComplete} />)
    expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()
    expect(screen.getByText(/A local environment variable manager/)).toBeInTheDocument()
  })

  it('displays feature list on the welcome step', () => {
    render(<Onboarding onComplete={onComplete} />)
    expect(screen.getByText(/Manage variables across multiple projects/)).toBeInTheDocument()
    expect(screen.getByText(/Shell hook auto-loads vars/)).toBeInTheDocument()
    expect(screen.getByText(/Values stay local/)).toBeInTheDocument()
  })

  it('renders the logo image', () => {
    render(<Onboarding onComplete={onComplete} />)
    const img = screen.getByAltText('.envVault')
    expect(img).toBeInTheDocument()
    expect(img.tagName).toBe('IMG')
  })

  it('has a Get Started button on the welcome step', () => {
    render(<Onboarding onComplete={onComplete} />)
    expect(screen.getByText('Get Started')).toBeInTheDocument()
  })

  // ── Step indicator / progress ─────────────────────

  it('renders step indicator dots', () => {
    render(<Onboarding onComplete={onComplete} />)
    const stepper = screen.getByLabelText('Setup progress')
    expect(stepper).toBeInTheDocument()
    // 3 steps = 3 dots
    const dots = stepper.querySelectorAll('[class*="ob-stepper-dot"]')
    expect(dots.length).toBe(3)
  })

  it('marks first dot as active on welcome step', () => {
    render(<Onboarding onComplete={onComplete} />)
    const stepper = screen.getByLabelText('Setup progress')
    const dots = stepper.querySelectorAll('[class*="ob-stepper-dot"]')
    expect(dots[0].className).toContain('ob-stepper-dot--active')
  })

  it('renders connecting lines between dots', () => {
    render(<Onboarding onComplete={onComplete} />)
    const stepper = screen.getByLabelText('Setup progress')
    const lines = stepper.querySelectorAll('[class*="ob-stepper-line"]')
    // 3 steps = 2 lines
    expect(lines.length).toBe(2)
  })

  // ── Navigation: Welcome -> Install ────────────────

  it('navigates to install step when Get Started is clicked', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    expect(screen.getByText('Set up shell integration')).toBeInTheDocument()
  })

  it('shows Back button on install step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    expect(screen.getByText('Back')).toBeInTheDocument()
  })

  it('renders ShellIntegration embed on install step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    expect(screen.getByTestId('shell-integration-embed')).toBeInTheDocument()
  })

  it('shows continue button with correct label on install step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    expect(screen.getByText("I've added the snippet")).toBeInTheDocument()
  })

  // ── Navigation: Install -> Welcome (back) ─────────

  it('navigates back to welcome when Back is clicked on install step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    fireEvent.click(screen.getByText('Back'))
    advanceTransition()

    expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()
  })

  // ── Navigation: Install -> Verify ─────────────────

  it('navigates to verify step when continue is clicked on install', () => {
    render(<Onboarding onComplete={onComplete} />)
    // Go to install
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    // Go to verify
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    expect(screen.getByText('Verify your setup')).toBeInTheDocument()
  })

  it('shows Check Integration button on verify step (idle state)', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    expect(screen.getByText('Check Integration')).toBeInTheDocument()
  })

  // ── Verify: checking state ────────────────────────

  it('shows checking state when Check Integration is clicked', async () => {
    mockedCheck.mockReturnValue(new Promise(() => {})) // never resolves
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('Checking shell config...')).toBeInTheDocument()
  })

  // ── Verify: found state ───────────────────────────

  it('shows found state when shell integration is detected (zsh)', async () => {
    mockedCheck.mockResolvedValue('zsh')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('zsh')).toBeInTheDocument()
    expect(screen.getByText(/Hook detected in/)).toBeInTheDocument()
  })

  it('shows found state with bash label', async () => {
    mockedCheck.mockResolvedValue('bash')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('bash')).toBeInTheDocument()
  })

  it('shows found state with both shells label', async () => {
    mockedCheck.mockResolvedValue('both')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('zsh and bash')).toBeInTheDocument()
  })

  it('shows Enter .envVault button when verification succeeds', async () => {
    mockedCheck.mockResolvedValue('zsh')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('Enter .envVault')).toBeInTheDocument()
  })

  // ── Verify: not_found state ───────────────────────

  it('shows not found state when hook is not detected', async () => {
    mockedCheck.mockResolvedValue('not_found')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('Hook not detected')).toBeInTheDocument()
  })

  it('shows hint text when hook is not detected', async () => {
    mockedCheck.mockResolvedValue('not_found')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText(/Paste the snippet into/)).toBeInTheDocument()
    expect(screen.getByText('~/.zshrc')).toBeInTheDocument()
    expect(screen.getByText('~/.bashrc')).toBeInTheDocument()
  })

  it('shows Check again and Back to instructions buttons when not found', async () => {
    mockedCheck.mockResolvedValue('not_found')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('Check again')).toBeInTheDocument()
    expect(screen.getByText('Back to instructions')).toBeInTheDocument()
  })

  it('handles checkShellIntegration error as not_found', async () => {
    mockedCheck.mockRejectedValue(new Error('Tauri error'))
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    expect(screen.getByText('Hook not detected')).toBeInTheDocument()
  })

  it('navigates back to install when Back to instructions is clicked', async () => {
    mockedCheck.mockResolvedValue('not_found')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    fireEvent.click(screen.getByText('Back to instructions'))
    advanceTransition()

    expect(screen.getByText('Set up shell integration')).toBeInTheDocument()
  })

  it('allows retrying verification with Check again', async () => {
    mockedCheck.mockResolvedValueOnce('not_found').mockResolvedValueOnce('zsh')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    // First attempt: not found
    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })
    expect(screen.getByText('Hook not detected')).toBeInTheDocument()

    // Retry: found
    await act(async () => {
      fireEvent.click(screen.getByText('Check again'))
    })
    expect(screen.getByText(/Hook detected in/)).toBeInTheDocument()
    expect(screen.getByText('Enter .envVault')).toBeInTheDocument()
  })

  // ── Completion ────────────────────────────────────

  it('calls onComplete and sets localStorage when Enter .envVault is clicked', async () => {
    mockedCheck.mockResolvedValue('zsh')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })

    fireEvent.click(screen.getByText('Enter .envVault'))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('dotenv_mgr_onboarding')).toBe('complete')
  })

  // ── Step indicator updates ────────────────────────

  it('updates step indicator dots as user progresses', () => {
    render(<Onboarding onComplete={onComplete} />)
    const stepper = screen.getByLabelText('Setup progress')

    // On welcome (step 0), only first dot is active
    let activeDots = stepper.querySelectorAll('.ob-stepper-dot--active')
    expect(activeDots.length).toBe(1)

    // Navigate to install (step 1)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    activeDots = stepper.querySelectorAll('.ob-stepper-dot--active')
    expect(activeDots.length).toBe(2)
  })

  it('updates step indicator lines as user progresses', () => {
    render(<Onboarding onComplete={onComplete} />)
    const stepper = screen.getByLabelText('Setup progress')

    // On welcome, no lines active
    let activeLines = stepper.querySelectorAll('.ob-stepper-line--active')
    expect(activeLines.length).toBe(0)

    // Navigate to install (step 1)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    activeLines = stepper.querySelectorAll('.ob-stepper-line--active')
    expect(activeLines.length).toBe(1)
  })

  // ── Navigation: Verify -> Install (back) ──────────

  it('navigates back from verify to install step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    // Click Back on verify step
    fireEvent.click(screen.getByText('Back'))
    advanceTransition()

    expect(screen.getByText('Set up shell integration')).toBeInTheDocument()
  })

  // ── Verify step subtitle ──────────────────────────

  it('shows correct subtitle on verify step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    expect(screen.getByText(/Confirm the shell hook is detected/)).toBeInTheDocument()
  })

  // ── Full wizard walkthrough ───────────────────────

  it('completes the full onboarding wizard flow', async () => {
    mockedCheck.mockResolvedValue('both')
    render(<Onboarding onComplete={onComplete} />)

    // Step 1: Welcome
    expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    // Step 2: Install
    expect(screen.getByText('Set up shell integration')).toBeInTheDocument()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    // Step 3: Verify
    expect(screen.getByText('Verify your setup')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('Check Integration'))
    })
    expect(screen.getByText('zsh and bash')).toBeInTheDocument()

    // Complete
    fireEvent.click(screen.getByText('Enter .envVault'))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('dotenv_mgr_onboarding')).toBe('complete')
  })

  // ── Enter key navigation ──────────────────────────

  it('Enter key on welcome step navigates to install', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.keyDown(window, { key: 'Enter' })
    advanceTransition()
    expect(screen.getByText('Set up shell integration')).toBeInTheDocument()
  })

  it('Enter key on install step navigates to verify', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    fireEvent.keyDown(window, { key: 'Enter' })
    advanceTransition()
    expect(screen.getByText('Verify your setup')).toBeInTheDocument()
  })

  it('Enter key on verify step (idle) triggers check', async () => {
    mockedCheck.mockReturnValue(new Promise(() => {})) // never resolves
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => { fireEvent.keyDown(window, { key: 'Enter' }) })
    expect(screen.getByText('Checking shell config...')).toBeInTheDocument()
  })

  it('Enter key on verify step (found) completes onboarding', async () => {
    mockedCheck.mockResolvedValue('zsh')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => { fireEvent.click(screen.getByText('Check Integration')) })
    expect(screen.getByText(/Hook detected in/)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onComplete).toHaveBeenCalled()
  })

  it('Enter key with metaKey does not trigger navigation', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })
    // Still on welcome step
    expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()
    expect(screen.queryByText('Set up shell integration')).not.toBeInTheDocument()
  })

  it('Enter key with ctrlKey does not trigger navigation', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })
    expect(screen.getByText('Welcome to .envVault')).toBeInTheDocument()
    expect(screen.queryByText('Set up shell integration')).not.toBeInTheDocument()
  })

  it('Enter key on verify step (not_found) does not trigger anything extra', async () => {
    mockedCheck.mockResolvedValue('not_found')
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()
    fireEvent.click(screen.getByText("I've added the snippet"))
    advanceTransition()

    await act(async () => { fireEvent.click(screen.getByText('Check Integration')) })
    expect(screen.getByText('Hook not detected')).toBeInTheDocument()

    // Enter key when verifyStatus is 'not_found' should do nothing (no else branch)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onComplete).not.toHaveBeenCalled()
    // Still on verify step
    expect(screen.getByText('Hook not detected')).toBeInTheDocument()
  })

  // ── aria-current on stepper dots ──────────────────

  it('sets aria-current=step on the active step dot', () => {
    render(<Onboarding onComplete={onComplete} />)
    const stepper = screen.getByLabelText('Setup progress')
    const dots = stepper.querySelectorAll('[class*="ob-stepper-dot"]')

    // Welcome step: first dot has aria-current
    expect(dots[0].getAttribute('aria-current')).toBe('step')
    expect(dots[1].getAttribute('aria-current')).toBeNull()
    expect(dots[2].getAttribute('aria-current')).toBeNull()
  })

  it('moves aria-current to second dot on install step', () => {
    render(<Onboarding onComplete={onComplete} />)
    fireEvent.click(screen.getByText('Get Started'))
    advanceTransition()

    const stepper = screen.getByLabelText('Setup progress')
    const dots = stepper.querySelectorAll('[class*="ob-stepper-dot"]')
    expect(dots[1].getAttribute('aria-current')).toBe('step')
  })
})
