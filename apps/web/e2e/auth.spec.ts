import { test, expect } from '@playwright/test';

/**
 * Auth smoke tests.
 *
 * DOM notes (from apps/web/src/app/login/page.tsx):
 * - <label> tags have no htmlFor / the <Input> has no id, so getByLabel
 *   won't work via implicit association.
 * - Inputs are identified by their type attribute (type="email",
 *   type="password") — semantic and stable.
 * - Error is rendered as a <p> inside the <form> only when login fails.
 * - On success the router pushes to /appointments (not /dashboard).
 * - JWT lives in an httpOnly cookie set by the backend; localStorage only
 *   stores the user profile object under the key "user".
 */

const LOGIN_URL = '/login';
const VALID_EMAIL = 'admin@taller.com';
const VALID_PASSWORD = 'admin1234';

test.describe('Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
  });

  test('valid credentials redirect to /appointments', async ({ page }) => {
    await page.locator('input[type="email"]').fill(VALID_EMAIL);
    await page.locator('input[type="password"]').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/appointments/, { timeout: 10_000 });
  });

  test('invalid credentials show an error message', async ({ page }) => {
    await page.locator('input[type="email"]').fill('wrong@example.com');
    await page.locator('input[type="password"]').fill('badpassword');
    await page.getByRole('button', { name: 'Ingresar' }).click();

    // The error <p> is rendered inside the <form> only on failure.
    const errorMessage = page.locator('form p');
    await expect(errorMessage).toBeVisible({ timeout: 8_000 });
  });

  test('after login, /appointments loads with recognisable content', async ({ page }) => {
    await page.locator('input[type="email"]').fill(VALID_EMAIL);
    await page.locator('input[type="password"]').fill(VALID_PASSWORD);
    await page.getByRole('button', { name: 'Ingresar' }).click();

    await expect(page).toHaveURL(/\/appointments/, { timeout: 10_000 });

    // The page should render something meaningful — a heading, a nav item,
    // or any landmark that signals the authenticated shell loaded.
    await expect(
      page.locator('h1, h2, [role="heading"], nav, main')
        .first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
