import { expect, test } from '@playwright/test';

test('production HTML carries a strict Content-Security-Policy', async ({
  request,
}) => {
  const html = await (await request.get('/')).text();
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(
    html,
  )?.[1];

  expect(csp).toBeDefined();
  expect(csp).toContain("script-src 'self';");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).not.toContain('localhost');
});

test('the app runs with no CSP violations or console errors', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(message.text());
    }
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/');
  await page.getByRole('link', { name: /Try without an account/ }).click();
  await page.getByRole('button', { name: /Rooftop Summer Party/ }).click();
  await expect(page.getByLabel('Design name')).toHaveValue(
    'Rooftop Summer Party',
  );
  await page.goto('/sign-in');
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();

  expect(problems).toEqual([]);
});

test.describe('deployed HTTP security headers', () => {
  test.skip(
    !process.env.E2E_BASE_URL,
    'Only meaningful against a Vercel deployment (set E2E_BASE_URL).',
  );

  for (const path of ['/', '/projects']) {
    test(`are set on ${path}`, async ({ request }) => {
      const headers = (await request.get(path)).headers();

      expect(headers['strict-transport-security']).toContain('max-age=');
      expect(headers['content-security-policy']).toContain(
        "frame-ancestors 'none'",
      );
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['referrer-policy']).toBe(
        'strict-origin-when-cross-origin',
      );
      expect(headers['permissions-policy']).toContain('camera=()');
    });
  }
});
