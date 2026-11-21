/**
 * P09 G1: landing → onboard → dashboard shows the key → revoke all → dashboard shows none.
 * Headless stand-in MetaMask (a viem account behind window.ethereum) and a CDP virtual WebAuthn authenticator with PRF.
 * If the virtual authenticator has no PRF, the password path is used instead (P09 failure branch).
 */
import { expect, test, type Page } from '@playwright/test'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const PASSWORD = 'e2e-only-password'

async function installMetaMask(page: Page) {
  const account = privateKeyToAccount(generatePrivateKey())
  let signatures = 0
  await page.exposeFunction('__qcMetaMask', async (method: string, params: any[]) => {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account.address]
    if (method === 'eth_chainId') return '0x2648'
    if (method === 'personal_sign') {
      signatures++
      return account.signMessage({ message: { raw: params[0] } })
    }
    throw Object.assign(new Error(`stand-in MetaMask: ${method} not supported`), { code: 4200 })
  })
  await page.addInitScript(() => {
    type Listener = (...args: unknown[]) => void
    const listeners: Record<string, Listener[]> = {}
    ;(window as any).ethereum = {
      isMetaMask: true,
      request: ({ method, params }: { method: string; params?: any[] }) => (window as any).__qcMetaMask(method, params ?? []),
      on: (e: string, f: Listener) => ((listeners[e] ??= []).push(f), undefined),
      removeListener: (e: string, f: Listener) => void (listeners[e] = (listeners[e] ?? []).filter((x) => x !== f)),
    }
  })
  return { address: account.address, signatures: () => signatures }
}

/** Virtual platform authenticator with PRF (Chrome DevTools Protocol). Returns false if PRF is unavailable. */
async function installPasskey(page: Page): Promise<boolean> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  try {
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true, hasPrf: true } as any,
    })
    return true
  } catch {
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    })
    return false
  }
}

test('landing → onboard → dashboard shows the key → revoke all → none', async ({ page }) => {
  const mm = await installMetaMask(page)
  const prf = await installPasskey(page)
  const t0 = Date.now()
  page.on('console', (m) => m.type() === 'error' && console.log('[browser]', m.text()))

  // 1. Landing (try PRF first; fall back to the password path if the browser reports no PRF).
  await page.goto(prf ? '/?timer=1' : '/?timer=1&protect=password')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The migration layer for the migration year.')
  await expect(page.getByText('Diana testnet').first()).toBeVisible()
  await page.getByRole('button', { name: 'Connect with MetaMask' }).first().click()

  // 2. Onboarding modal
  const modal = page.getByTestId('qc-onboarding')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading')).toHaveText('Give your account a quantum-safe key')
  const passwordField = modal.locator('input[type=password]')
  let path = 'passkey'
  if (await passwordField.isVisible()) {
    path = 'password'
    await passwordField.fill(PASSWORD)
    await modal.getByRole('button', { name: 'Continue' }).click()
  } else {
    await modal.getByRole('button', { name: 'Create with passkey' }).click()
  }
  await expect(modal.getByRole('heading')).toHaveText("You're on QoreChain", { timeout: 180_000 })
  const onboardMs = Date.now() - t0
  expect(mm.signatures()).toBe(1)
  await modal.getByRole('button', { name: /Continue to/ }).click()

  // 3. Dashboard shows the root and the MetaMask key
  await page.waitForURL('**/account')
  await expect(page.getByText('Quantum-safe root: active')).toBeVisible()
  const keys = page.getByTestId('key-list')
  await expect(keys).toContainText(mm.address.toLowerCase())
  await expect(page.getByTestId('damage-cap')).toContainText('QOR per day')
  const qor = (await page.getByTestId('qor-address').textContent())?.trim()

  // 4. Q-Day kill switch
  await page.getByTestId('kill-switch').click()
  // The root may still be unlocked from onboarding (5-minute auto-lock); otherwise the password prompt appears.
  const unlock = page.getByTestId('qc-unlock')
  if (path === 'password' && (await unlock.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false))) {
    await unlock.locator('input[type=password]').fill(PASSWORD)
    await unlock.getByRole('button', { name: 'Unlock' }).click()
  }
  await expect(page.getByTestId('kill-success')).toHaveText('Only your quantum-safe root key can act now.', { timeout: 180_000 })
  await expect(page.getByTestId('no-keys')).toBeVisible()
  await expect(page.getByTestId('damage-cap')).toContainText('No classical key can act')

  console.log(JSON.stringify({ path, prf, account: qor, metamask: mm.address, onboardMs, totalMs: Date.now() - t0, signatures: mm.signatures() }))
})

test('360 px: no horizontal scroll on landing and account pages', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  for (const path of ['/', '/account']) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})
