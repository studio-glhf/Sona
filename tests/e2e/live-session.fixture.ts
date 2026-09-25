import { expect, type Page } from '@playwright/test';

type ServerEvent = { type: string; [key: string]: unknown };
type BrowserFixture = {
  sent: ServerEvent[];
  tracks: { enabled: boolean; stopped: boolean }[];
  peersClosed: number;
  emit: (event: ServerEvent) => void;
  disconnect: () => void;
};
declare global {
  interface Window {
    __sonaFixture: BrowserFixture;
  }
}

/** Test-only browser doubles: no microphone, generated audio, or external API traffic. */
export async function mockLiveSession(
  page: Page,
  options: { microphoneDenied?: boolean; credentialsRejected?: boolean } = {},
) {
  const requests: string[] = [];
  await page.route(/\/api\/|https:\/\/api\.openai\.com\//, async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname);
    if (url.pathname === '/api/realtime/sessions') {
      await route.fulfill({
        status: options.credentialsRejected ? 401 : 200,
        json: options.credentialsRejected
          ? { error: 'invalid_key' }
          : {
              clientSecret: 'ek_synthetic_browser_fixture',
              expiresAt: 2_000_000_000,
            },
      });
    } else if (url.pathname === '/v1/realtime/calls') {
      await route.fulfill({
        status: 200,
        contentType: 'application/sdp',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: 'synthetic-sdp-answer',
      });
    } else {
      await route.abort();
    }
  });
  await page.addInitScript(({ microphoneDenied }) => {
    let peer: Peer | undefined;
    const fixture: BrowserFixture = {
      sent: [],
      tracks: [],
      peersClosed: 0,
      emit: (event) =>
        peer?.channel.onmessage?.({ data: JSON.stringify(event) }),
      disconnect: () => {
        if (peer) {
          peer.connectionState = 'disconnected';
          peer.onconnectionstatechange?.();
        }
      },
    };
    window.__sonaFixture = fixture;
    navigator.mediaDevices.getUserMedia = async () => {
      if (microphoneDenied) {
        throw new DOMException(
          'Synthetic permission denial',
          'NotAllowedError',
        );
      }
      const track = {
        enabled: true,
        stopped: false,
        stop() {
          this.stopped = true;
        },
      };
      fixture.tracks.push(track);
      return {
        getTracks: () => [track],
        getAudioTracks: () => [track],
      } as unknown as MediaStream;
    };
    class Channel {
      readyState = 'connecting';
      onopen?: () => void;
      onmessage?: (event: { data: string }) => void;
      send(value: string) {
        fixture.sent.push(JSON.parse(value) as ServerEvent);
      }
      close() {
        this.readyState = 'closed';
      }
    }
    class Peer {
      channel = new Channel();
      connectionState = 'new';
      onconnectionstatechange?: () => void;
      ontrack?: (event: { streams: MediaStream[] }) => void;
      constructor() {
        peer = this;
      }
      addTrack() {}
      createDataChannel() {
        return this.channel;
      }
      async createOffer() {
        return { type: 'offer', sdp: 'synthetic-sdp-offer' };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.connectionState = 'connected';
        this.channel.readyState = 'open';
        this.channel.onopen?.();
        fixture.emit({ type: 'session.created' });
        this.ontrack?.({ streams: [new MediaStream()] });
      }
      close() {
        this.connectionState = 'closed';
        fixture.peersClosed += 1;
      }
    }
    Object.defineProperty(window, 'RTCPeerConnection', { value: Peer });
    Object.defineProperty(window, 'Audio', {
      value: class {
        autoplay = false;
        srcObject: MediaStream | null = null;
        async play() {}
        pause() {}
        remove() {}
      },
    });
    Object.defineProperty(window, 'AudioContext', {
      value: class {
        state = 'running';
        createAnalyser() {
          return {
            fftSize: 256,
            getByteTimeDomainData(data: Uint8Array) {
              data.fill(150);
            },
            disconnect() {},
          };
        }
        createMediaStreamSource() {
          return { connect() {}, disconnect() {} };
        }
        async resume() {}
        async close() {
          this.state = 'closed';
        }
      },
    });
  }, options);
  return requests;
}

export async function startLiveSession(page: Page) {
  await page
    .getByLabel('OpenAI API key', { exact: true })
    .fill('synthetic-key-for-browser-test');
  await page
    .getByRole('button', { name: 'Start session', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText('Listening');
}

export async function emit(page: Page, event: ServerEvent) {
  await page.evaluate((event) => window.__sonaFixture.emit(event), event);
}

export async function fixtureState(page: Page) {
  return page.evaluate(() => {
    const fixture = window.__sonaFixture;
    return {
      sent: fixture.sent,
      tracks: fixture.tracks,
      peersClosed: fixture.peersClosed,
    };
  });
}

export async function acknowledgeUpdate(page: Page, rejected = false) {
  await page.evaluate((rejected) => {
    const fixture = window.__sonaFixture;
    const update = fixture.sent
      .filter((event) => event.type === 'session.update')
      .at(-1);
    if (!update) throw new Error('No session.update was sent');
    fixture.emit(
      rejected
        ? {
            type: 'error',
            error: { event_id: update.event_id, code: 'invalid_value' },
          }
        : { type: 'session.updated', session: update.session },
    );
  }, rejected);
}

export async function disconnect(page: Page) {
  await page.evaluate(() => window.__sonaFixture.disconnect());
}
