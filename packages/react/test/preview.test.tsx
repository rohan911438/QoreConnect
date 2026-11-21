import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { buildPreview, DIANA } from '@qoreconnect/core'
import { QoreConnectProvider, SigningPreview, createQoreConnectUI } from '../src/index'

const ROOT = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const MM = '0x974944048dec3f8ff1ba6bb076724d86c085d69b'
const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const call = {
  chainId: DIANA.chainId,
  account: ROOT,
  pubkey: MM,
  to: COUNTER,
  valueWei: 0n,
  data: '0xd09de08a',
  gasLimit: 120_000,
  nonce: 3n,
}
const ctx = {
  net: DIANA,
  rootEvm: '0x789f00f2f6705ed10df035477fc72d3c4470e4e4',
  rule: { perTxLimit: 1_000_000n, dailyLimit: 5_000_000n, allowedEvmCalls: [COUNTER] },
  approved: [COUNTER],
  fourByte: false,
}

afterEach(cleanup)

describe('SigningPreview', () => {
  it('renders contract, function, checks and the honesty label; labelled dialog', async () => {
    const preview = await buildPreview(call, ctx)
    render(
      <SigningPreview
        preview={preview}
        appName="Quantum Tip Jar"
        signerAddress={MM}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('heading', { name: 'increment' })).toBeTruthy()
    expect(dialog.getAttribute('aria-labelledby')).toBe(screen.getByRole('heading').id)
    expect(screen.getByTestId('qc-label').textContent).toBe('Classical, capped')
    expect(screen.getByText('increment()')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toContain(COUNTER)
    expect(screen.getByText('Contract approved for your account')).toBeTruthy()
    expect(document.activeElement?.textContent).toBe('Confirm in MetaMask')
  })

  it('blocked calls show "Blocked by chain" and offer no signing button', async () => {
    const preview = await buildPreview({ ...call, to: '0x1111111111111111111111111111111111111111' }, ctx)
    render(<SigningPreview preview={preview} appName="T" signerAddress={MM} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByTestId('qc-label').textContent).toBe('Blocked by chain')
    expect(screen.queryByText('Confirm in MetaMask')).toBeNull()
    expect(screen.getByText(/Failed:/)).toBeTruthy()
  })

  it('keyboard: Escape cancels, Tab is trapped inside the dialog', async () => {
    const onCancel = vi.fn()
    const preview = await buildPreview(call, ctx)
    render(<SigningPreview preview={preview} appName="T" signerAddress={MM} onConfirm={() => {}} onCancel={onCancel} />)
    const confirm = screen.getByText('Confirm in MetaMask')
    const link = screen.getByRole('link')
    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Tab' })
    expect(document.activeElement).toBe(link)
    fireEvent.keyDown(link, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(confirm)
    fireEvent.keyDown(confirm, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })
})

describe('QoreConnectProvider (React) wires the provider preview hook', () => {
  it('onPreview resolves true on Confirm and false on Cancel', async () => {
    const ui = createQoreConnectUI()
    render(<QoreConnectProvider ui={ui}>app</QoreConnectProvider>)
    const preview = await buildPreview(call, ctx)
    const req = {
      preview,
      account: { qorAddress: ROOT, evmAddress: ctx.rootEvm },
      metamaskAddress: MM,
      appName: 'Quantum Tip Jar',
    }

    let p!: Promise<boolean>
    act(() => void (p = ui.hooks.onPreview!(req)))
    fireEvent.click(await screen.findByText('Confirm in MetaMask'))
    expect(await p).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => void (p = ui.hooks.onPreview!(req)))
    fireEvent.click(await screen.findByText('Cancel'))
    expect(await p).toBe(false)
  })
})
