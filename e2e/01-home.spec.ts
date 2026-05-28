import { test, expect } from '@playwright/test'

/**
 * Test 1: Home page renders correctly
 */
test('Home page loads and has key elements', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'e2e/screenshots/01-home.png', fullPage: true })

  // Check critical elements exist
  await expect(page.locator('text=MAYA')).toBeVisible()
  await expect(page.locator('text=Get Started')).toBeVisible()
  // Accessibility check: ensure heading is present
  const h1 = page.locator('h1')
  await expect(h1).toBeVisible()
  const h1Text = await h1.textContent()
  console.log('Home page h1:', h1Text)
})

/**
 * Test 2: Get Started redirects to /sign-in when unauthenticated
 */
test('Get Started → redirects to sign-in', async ({ page }) => {
  await page.goto('/')
  const cta = page.locator('button:has-text("Get Started")').first()
  await cta.click()
  await page.waitForURL('**/sign-in**', { timeout: 5000 })
  await page.screenshot({ path: 'e2e/screenshots/02-sign-in.png', fullPage: true })

  // Verify sign-in page content
  const signInText = await page.locator('h2').textContent()
  console.log('Sign-in page heading:', signInText)
  expect(['Authentication Required', 'Sign in']).toContain(signInText)
})
