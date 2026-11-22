import { expect, test } from '@playwright/test'

/**
 * Q-Day exposure report against real Diana data (read-only, signs nothing).
 * The relayer's sponsor account has a registered ML-DSA-87 key and no MetaMask keys, so it must grade A.
 */
const SPONSOR = 'qor1wpae9a38v7vlj2xvun2cw0669w4ls568zar4w8'

test('exposure: form → shareable report with grade, findings and a sourced chain parameter', async ({ page }) => {
  await page.goto('/exposure')
  await page.waitForLoadState('networkidle') // React must be hydrated before the form handles submit
  await page.getByTestId('exposure-input').fill('not-an-address')
  await page.getByTestId('exposure-submit').click()
  await expect(page.getByTestId('exposure-form-error')).toContainText('qor1')

  await page.getByTestId('exposure-input').fill(SPONSOR)
  await page.getByTestId('exposure-submit').click()
  await expect(page).toHaveURL(new RegExp(`/exposure/${SPONSOR}$`))
  const report = page.getByTestId('exposure-report')
  await expect(report).toHaveAttribute('data-status', 'protected')
  await expect(page.getByTestId('exposure-grade')).toContainText('A')
  await expect(page.getByTestId('exposure-headline')).toContainText('quantum-safe')
  await expect(report.getByRole('link', { name: 'Source' }).first()).toHaveAttribute(
    'href',
    /qorechain\/pqc\/v1\/params/,
  )
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image/)
})

test('exposure: the share card renders as a PNG', async ({ page, request }) => {
  await page.goto(`/exposure/${SPONSOR}`)
  const og = await page.locator('meta[property="og:image"]').getAttribute('content')
  const res = await request.get(new URL(og!).pathname + new URL(og!).search)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')
})

test('exposure: a bad address shows an error, not a crash', async ({ page }) => {
  await page.goto('/exposure/0x1234')
  await expect(page.getByTestId('exposure-error')).toBeVisible()
})
