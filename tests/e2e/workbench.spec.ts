import { expect, test } from '@playwright/test';

test('simulation supports speech activity, interruption, and reconnect without API or microphone use', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  await page.route(/\/api\/|api\.openai\.com/, async (route) => {
    apiRequests.push(route.request().url());
    await route.abort();
  });
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new Error('Simulation must not request a microphone');
    };
  });
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Listening');
  await page.getByRole('button', { name: 'Try a sample turn' }).click();
  await expect(page.getByRole('status')).toHaveText('Speaking');
  await expect(page.locator('.character-wrap')).toHaveClass(/speaking/);
  await expect(page.locator('.mouth')).not.toHaveAttribute('ry', '1.5');
  await page.getByRole('button', { name: 'Interrupt', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Listening');
  await expect(page.locator('.mouth')).toHaveAttribute('ry', '1.5');
  await page.getByRole('button', { name: 'Show conversation' }).click();
  await expect(page.getByText('Synthetic dialogue')).toBeVisible();
  await expect(
    page.getByText('What can we explore in this conversation?'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Simulate disconnect' }).click();
  await expect(page.getByRole('alert')).toContainText('session disconnected');
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Listening');
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Offline');
  await page.getByRole('button', { name: 'Live API', exact: true }).click();
  await expect(page.getByText('Synthetic dialogue')).toBeVisible();
  expect(apiRequests).toEqual([]);
});

test('draft settings require Apply and voice changes explain restart', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await page
    .getByRole('textbox', { name: /Agent instructions/ })
    .fill('Keep replies brief and ask one question at a time. \n');
  await expect(page.getByText('Unapplied changes')).toBeVisible();
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(page.getByText('Settings confirmed')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply settings' }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page
    .getByRole('combobox', { name: /Turn detection/ })
    .selectOption('server_vad');
  await expect(
    page.getByRole('slider', { name: /Voice activity threshold/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(page.getByText('Settings confirmed')).toBeVisible();
  await page.getByRole('button', { name: 'Common', exact: true }).click();
  await page.getByRole('combobox', { name: /^Voice/ }).selectOption('cedar');
  await expect(
    page.getByText(
      'End this session and start again to use this model or voice.',
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply settings' }),
  ).toBeDisabled();
});

test('Korean layout supports keyboard operation and reduced motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 960, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: '한국어', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(
    page.getByRole('heading', { name: '보이스 플레이그라운드' }),
  ).toBeVisible();
  const settings = page
    .getByRole('button', { name: '에이전트 설정 닫기' })
    .first();
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.getByRole('combobox', { name: '응답 언어' }).selectOption('ko');
  const start = page.getByRole('button', { name: '세션 시작', exact: true });
  await start.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('듣는 중');
  await page.getByRole('button', { name: '예시 대화 시작' }).click();
  await page.getByRole('button', { name: '대화 열기' }).click();
  await expect(
    page.getByText('이번 대화에서 무엇을 시험해 볼까요?'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('denied microphone access clears the key and explains recovery', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Synthetic permission denial', 'NotAllowedError');
    };
  });
  const requests: string[] = [];
  await page.route(/\/api\/|api\.openai\.com/, async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Live API', exact: true }).click();
  await page
    .getByLabel('OpenAI API key', { exact: true })
    .fill('synthetic-key-for-browser-test');
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Microphone access was denied',
  );
  await expect(page.getByLabel('OpenAI API key', { exact: true })).toBeEmpty();
  await expect(
    page.getByRole('button', { name: 'Start session', exact: true }),
  ).toBeDisabled();
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});
