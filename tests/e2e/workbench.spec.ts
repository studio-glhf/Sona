import { expect, test } from '@playwright/test';
import {
  acknowledgeUpdate,
  disconnect,
  emit,
  fixtureState,
  mockLiveSession,
  startLiveSession,
} from './live-session.fixture';

test('live workbench starts with a key and handles speech, mute, interruption, and disconnect', async ({
  page,
}) => {
  const requests = await mockLiveSession(page);
  await page.goto('/');
  await expect(
    page.getByRole('button', {
      name: /Simulation|Live API|Try a sample turn|Simulate disconnect/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Start session', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel('OpenAI API key', { exact: true }),
  ).toBeVisible();
  await startLiveSession(page);
  expect(requests).toEqual(['/api/realtime/sessions', '/v1/realtime/calls']);
  await page
    .getByRole('button', { name: 'Mute microphone', exact: true })
    .click();
  expect((await fixtureState(page)).tracks[0].enabled).toBe(false);
  await page
    .getByRole('button', { name: 'Unmute microphone', exact: true })
    .click();
  expect((await fixtureState(page)).tracks[0].enabled).toBe(true);
  await emit(page, { type: 'response.created' });
  await expect(page.getByRole('status')).toHaveText('Thinking');
  await emit(page, { type: 'output_audio_buffer.started' });
  await emit(page, {
    type: 'response.output_audio_transcript.done',
    item_id: 'fixture-reply',
    transcript: 'Let’s explore a concise reply.',
  });
  await expect(page.getByRole('status')).toHaveText('Speaking');
  await expect(page.locator('.character-wrap')).toHaveClass(/speaking/);
  await expect(page.locator('.mouth')).not.toHaveAttribute('ry', '1.5');
  await page.getByRole('button', { name: 'Interrupt', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Listening');
  await expect(page.locator('.mouth')).toHaveAttribute('ry', '1.5');
  expect((await fixtureState(page)).sent.map((event) => event.type)).toEqual([
    'response.cancel',
    'output_audio_buffer.clear',
  ]);
  await page.getByRole('button', { name: 'Show conversation' }).click();
  await expect(page.getByText('Let’s explore a concise reply.')).toBeVisible();
  await expect(page.getByText('Synthetic dialogue')).toHaveCount(0);
  await disconnect(page);
  await expect(page.getByRole('alert')).toContainText('session disconnected');
  await expect(page.getByLabel('OpenAI API key', { exact: true })).toBeEmpty();
  expect((await fixtureState(page)).tracks[0].stopped).toBe(true);
  await startLiveSession(page);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Offline');
  const resources = await fixtureState(page);
  expect(resources.tracks.every((track) => track.stopped)).toBe(true);
  expect(resources.peersClosed).toBe(2);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});

test('Apply waits for acknowledgment, supports rejection recovery, and explains voice restart', async ({
  page,
}) => {
  await mockLiveSession(page);
  await page.goto('/');
  await startLiveSession(page);
  await page
    .getByRole('textbox', { name: /Agent instructions/ })
    .fill('Keep replies brief and ask one question at a time. \n');
  await expect(page.getByText('Unapplied changes')).toBeVisible();
  expect((await fixtureState(page)).sent).toEqual([]);
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await expect(
    page.getByText('Waiting for session confirmation…'),
  ).toBeVisible();
  await expect(page.getByText('Settings confirmed')).toHaveCount(0);
  await acknowledgeUpdate(page);
  await expect(page.getByText('Settings confirmed')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Apply settings' }),
  ).toBeDisabled();
  await page
    .getByRole('textbox', { name: /Agent instructions/ })
    .fill('Try a different instruction.');
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await acknowledgeUpdate(page, true);
  await expect(page.getByRole('alert')).toContainText(
    'previous settings are still active',
  );
  await expect(page.getByText('Unapplied changes')).toBeVisible();
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await acknowledgeUpdate(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page
    .getByRole('combobox', { name: /Turn detection/ })
    .selectOption('server_vad');
  await expect(
    page.getByRole('slider', { name: /Voice activity threshold/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Apply settings' }).click();
  await acknowledgeUpdate(page);
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
  await mockLiveSession(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 960, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: '한국어', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(
    page.getByRole('heading', { name: '보이스 플레이그라운드' }),
  ).toBeVisible();
  await expect(page.getByText('시뮬레이션', { exact: true })).toHaveCount(0);
  const settings = page
    .getByRole('button', { name: '에이전트 설정 닫기' })
    .first();
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary')).toBeVisible();
  await page.getByRole('combobox', { name: '응답 언어' }).selectOption('ko');
  await page
    .getByLabel('OpenAI API 키', { exact: true })
    .fill('synthetic-key-for-browser-test');
  await page.getByRole('button', { name: '세션 시작', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('듣는 중');
  await emit(page, {
    type: 'response.output_audio_transcript.done',
    item_id: 'fixture-korean',
    transcript: '어떤 대화를 시험해 볼까요?',
  });
  await page.getByRole('button', { name: '대화 열기' }).click();
  await expect(page.getByText('어떤 대화를 시험해 볼까요?')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('denied microphone access clears the key and explains recovery without calling the broker', async ({
  page,
}) => {
  const requests = await mockLiveSession(page, { microphoneDenied: true });
  await page.goto('/');
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
});

test('rejected credentials release the microphone and never negotiate a voice connection', async ({
  page,
}) => {
  const requests = await mockLiveSession(page, { credentialsRejected: true });
  await page.goto('/');
  await page
    .getByLabel('OpenAI API key', { exact: true })
    .fill('synthetic-key-for-browser-test');
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('API key was rejected');
  await expect(page.getByLabel('OpenAI API key', { exact: true })).toBeEmpty();
  expect(requests).toEqual(['/api/realtime/sessions']);
  const resources = await fixtureState(page);
  expect(resources.tracks[0].stopped).toBe(true);
  expect(resources.peersClosed).toBe(1);
});
