import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

let attempt = 0
vi.mock('@qoreconnect/core', async (orig) => {
  const real = await orig<any>()
  return {
    ...real,
    onboardAndLink: vi.fn(async (o: any) => {
      attempt++
      o.onEvent?.({ step: 'created', qorAddress: 'qor1test', evmAddress: '0xabc', root: o.root ?? { qorAddress: 'qor1test', evmAddress: '0xabc' } })
      o.onEvent?.({ step: 'signed' })
      if (attempt === 1) throw new real.QoreConnectError('RELAYER_UNAVAILABLE')
      o.onEvent?.({ step: 'registered', alreadyRegistered: false, ms: 1 })
      o.onEvent?.({ step: 'linked', alreadyLinked: false })
      return { root: { qorAddress: 'qor1test', evmAddress: '0xabc' }, linkProof: { metamaskAddress: '0x1', pubkey: new Uint8Array(), possessionProof: new Uint8Array() }, ms: 5 }
    }),
  }
})

const { DIANA, MemoryVaultStorage, RootVault, onboardAndLink } = await import('@qoreconnect/core')
const { ApproveSheet, OnboardingModal } = await import('../src/index')

afterEach(cleanup)

describe('OnboardingModal', () => {
  it('explains, runs, shows a clear error with Retry that resumes, then done', async () => {
    const onDone = vi.fn()
    render(
      <OnboardingModal
        appName="Quantum Tip Jar"
        net={DIANA}
        vault={new RootVault(new MemoryVaultStorage())}
        metamask={{ request: async () => [] }}
        relayerUrl="http://r"
        contracts={[]}
        forcePassword
        showTimer
        onDone={onDone}
        onCancel={() => {}}
      />,
    )
    expect(screen.getByRole('heading').textContent).toBe('Give your account a quantum-safe key')
    expect(screen.getAllByText(/Diana testnet/).length).toBeGreaterThan(0)
    const go = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Choose a password/), { target: { value: 'long enough pw' } })
    fireEvent.click(go)

    await screen.findByText('Something stopped')
    expect(screen.getByRole('alert').textContent).toMatch(/relayer|Retry continues/i)
    expect(screen.getByTestId('qc-timer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await screen.findByText("You're on QoreChain")
    // Retry reuses the root and the MetaMask proof from the first attempt.
    const second = vi.mocked(onboardAndLink).mock.calls[1]![0] as any
    expect(second.protection).toBeUndefined()
    expect(second.root).toMatchObject({ qorAddress: 'qor1test' })
    expect(screen.getByText('Quantum-safe')).toBeTruthy()
    expect(screen.getByText('Classical, capped')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Continue to Quantum Tip Jar/ }))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })
})

describe('ApproveSheet', () => {
  it('shows contracts with explorer links and unchanged limits', async () => {
    const onApprove = vi.fn()
    render(
      <ApproveSheet
        appName="Quantum Tip Jar"
        origin="https://tipjar.example"
        contracts={['0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74', '0x1111111111111111111111111111111111111111/0xa9059cbb']}
        net={DIANA}
        limits={{ perTxUqor: 1_000_000n, dailyUqor: 5_000_000n }}
        onApprove={onApprove}
        onCancel={() => {}}
        hasCode={async () => true}
      />,
    )
    expect(screen.getByRole('heading').textContent).toBe('Approve Quantum Tip Jar to use your account?')
    expect(screen.queryByTestId('qc-approve-nocode')).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText(/only function 0xa9059cbb/)).toBeTruthy()
    expect(screen.getByText(/Unchanged: 1 QOR per transaction, 5 QOR per day/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve with passkey' }))
    await waitFor(() => expect(onApprove).toHaveBeenCalledOnce())
  })

  it('T4: warns when an address has no contract code, and says code is not verified', async () => {
    render(
      <ApproveSheet
        appName="Shady"
        contracts={['0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74', '0x2222222222222222222222222222222222222222']}
        net={DIANA}
        onApprove={() => {}}
        onCancel={() => {}}
        hasCode={async (a) => a.startsWith('0xfa')}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('qc-approve-nocode').textContent).toMatch(/One address has no contract code/))
    expect(screen.getAllByText('No contract code')).toHaveLength(1)
    expect(screen.getByText(/does not verify what a contract/)).toBeTruthy()
  })
})
