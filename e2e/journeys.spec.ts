import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

/** Test-only credentials for a device-local account in a throwaway browser profile. */
const ACCOUNT = {
  name: 'E2E Tester',
  email: 'e2e.tester@example.test',
  password: 'E2e-only-password-42',
};

async function signUp(page: Page) {
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill(ACCOUNT.name);
  await page.getByLabel('Email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save your recovery code' });
  await expect(dialog.getByLabel('Recovery code', { exact: true })).toHaveText(
    /^([0-9A-Z]{4}-){4}[0-9A-Z]{4}$/,
  );
  await dialog
    .getByRole('checkbox', { name: /stored my recovery code/ })
    .check();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
}

async function exportAs(page: Page, format: string, fileName: string) {
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await dialog.getByText(format, { exact: true }).click();
  await dialog.getByLabel('File name').fill(fileName);
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: `Download ${format}` }).click();
  return downloadPromise;
}

test('sandbox: design without an account and export real PNG, JPEG, SVG and PDF files', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Try without an account/ }).click();
  await page.getByRole('button', { name: /Thirty & Thriving/ }).click();
  await expect(page.getByText('Not saved')).toBeVisible();

  await page.getByRole('button', { name: 'Add heading' }).click();
  await expect(page.getByRole('tab', { name: /Layers/ })).toContainText('11');

  const signatures: Record<string, number[] | string> = {
    PNG: [0x89, 0x50, 0x4e, 0x47],
    JPEG: [0xff, 0xd8, 0xff],
    SVG: '<?xml',
    PDF: '%PDF-',
  };
  const extensions: Record<string, string> = {
    PNG: 'png',
    JPEG: 'jpg',
    SVG: 'svg',
    PDF: 'pdf',
  };
  for (const [format, signature] of Object.entries(signatures)) {
    const download = await exportAs(page, format, 'Birthday invite');
    expect(download.suggestedFilename()).toBe(
      `Birthday invite.${extensions[format]}`,
    );
    const bytes = await readFile(await download.path());
    if (typeof signature === 'string') {
      expect(bytes.subarray(0, signature.length).toString()).toBe(signature);
    } else {
      expect([...bytes.subarray(0, signature.length)]).toEqual(signature);
    }
  }
  await expect(page.getByText('Downloaded Birthday invite.pdf.')).toBeVisible();
});

test('account: sign up, design, survive a reload encrypted, and filter projects', async ({
  page,
}) => {
  await signUp(page);
  await page.getByRole('button', { name: /Quarterly Town Hall/ }).click();
  const name = page.getByLabel('Design name');
  await name.fill('Q4 Town Hall');
  await name.press('Enter');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // The last edit is written when the tab is hidden, then survives a reload.
  await page.getByRole('button', { name: /Shapes/ }).click();
  await page.getByRole('button', { name: 'Add star' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Design name')).toHaveValue('Q4 Town Hall');
  await expect(page.getByRole('tab', { name: /Layers/ })).toContainText('12');

  // Nothing readable is stored at rest.
  const leaked = await page.evaluate(async () => {
    const names = (await indexedDB.databases()).map((db) => db.name ?? '');
    const workspace = names.find((dbName) =>
      dbName.startsWith('canvas-studio-v2-workspace-'),
    );
    if (!workspace) {
      return 'no workspace';
    }
    return new Promise<string>((resolve) => {
      const request = indexedDB.open(workspace);
      request.onsuccess = () => {
        const read = request.result
          .transaction('documents')
          .objectStore('documents')
          .getAll();
        read.onsuccess = () => {
          const text = (read.result as { payload: { data: ArrayBuffer } }[])
            .map((row) => new TextDecoder().decode(row.payload.data))
            .join('');
          request.result.close();
          resolve(text.includes('Town Hall') ? 'leaked' : 'sealed');
        };
      };
    });
  });
  expect(leaked).toBe('sealed');

  await page.getByRole('link', { name: 'Back to projects' }).click();
  await expect(page.getByRole('link', { name: 'Q4 Town Hall' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Birthday/ }).check();
  await expect(page.getByText('No designs match')).toBeVisible();
  expect(page.url()).toContain('type=birthday');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: 'Q4 Town Hall' })).toBeVisible();
});
