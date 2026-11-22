/** P13 / T17: security headers, a nonce CSP on vault pages, and no CSP violations in normal use. */
import { expect, test } from '@playwright/test'

const VAULT = ['/', '/account', '/dev/vault']
const OTHER = ['/meter', '/doctor']

for (const path of [...VAULT, ...OTHER]) {
  test(`headers and no CSP violations: ${path}`, async ({ page }) => {
    const violations: string[] = []
    page.on('console', (m) => /Content.Security.Policy|Refused to/i.test(m.text()) && violations.push(m.text()))
    const res = await page.goto(path)
    const h = res!.headers()
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-powered-by']).toBeUndefined()
    const policy = h['content-security-policy']
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    if (VAULT.includes(path)) expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+'/)
    await page.waitForLoadState('networkidle')
    // Hydrated (React ran): the theme button works, so Next's own scripts carry the nonce.
    await page.getByRole('button', { name: /Change theme/ }).click()
    expect(violations).toEqual([])
  })
}

test('vault page: a script injected without the nonce does not run; the nonce changes per request', async ({ page }) => {
  const a = (await page.goto('/account'))!.headers()['content-security-policy'] ?? ''
  const b = (await page.goto('/account'))!.headers()['content-security-policy'] ?? ''
  expect(a.match(/nonce-([^']+)/)![1]).not.toBe(b.match(/nonce-([^']+)/)![1])
  const ran = await page.evaluate(async () => {
    ;(window as any).__xss = false
    const s = document.createElement('script')
    s.textContent = 'window.__xss = true'
    document.body.appendChild(s)
    const img = document.createElement('img')
    img.src = 'x'
    img.setAttribute('onerror', 'window.__xss = true')
    document.body.appendChild(img)
    await new Promise((r) => setTimeout(r, 300))
    return (window as any).__xss
  })
  expect(ran).toBe(false)
})

test('a third-party script cannot load on any page', async ({ page }) => {
  await page.goto('/')
  const loaded = await page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const s = document.createElement('script')
        s.src = 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js'
        s.onload = () => resolve(true)
        s.onerror = () => resolve(false)
        document.head.appendChild(s)
        setTimeout(() => resolve(false), 3000)
      }),
  )
  expect(loaded).toBe(false)
})
