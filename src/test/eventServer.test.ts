import * as http from 'http';
import { EventServer } from '../eventServer';

const TEST_PORT = 17891;

describe('EventServer', () => {
  let server: EventServer;

  beforeEach(() => {
    server = new EventServer(TEST_PORT);
  });

  afterEach(async () => {
    await server.stop();
  });

  it('starts and reports the configured port', async () => {
    await server.start();
    expect(server.getPort()).toBe(TEST_PORT);
  });

  it('returns 405 for non-POST requests', async () => {
    await server.start();
    const res = await request('GET', TEST_PORT, '');
    expect(res.statusCode).toBe(405);
  });

  it('returns 204 for OPTIONS (CORS preflight)', async () => {
    await server.start();
    const res = await request('OPTIONS', TEST_PORT, '');
    expect(res.statusCode).toBe(204);
  });

  it('returns 400 for malformed JSON', async () => {
    await server.start();
    const res = await request('POST', TEST_PORT, 'not json');
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 and emits an event for a valid POST', async () => {
    await server.start();
    const received: unknown[] = [];
    server.on('event', e => received.push(e));

    const res = await request('POST', TEST_PORT, JSON.stringify({ type: 'stop' }));
    await tick();

    expect(res.statusCode).toBe(200);
    expect(received).toHaveLength(1);
    expect((received[0] as any).type).toBe('stop');
  });

  it('stamps a numeric timestamp on received events', async () => {
    await server.start();
    const before = Date.now();
    const received: any[] = [];
    server.on('event', e => received.push(e));

    await request('POST', TEST_PORT, JSON.stringify({ type: 'stop' }));
    await tick();

    expect(typeof received[0].timestamp).toBe('number');
    expect(received[0].timestamp).toBeGreaterThanOrEqual(before);
    expect(received[0].timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('fails to start when the port is already occupied', async () => {
    await server.start();
    const duplicate = new EventServer(TEST_PORT);
    await expect(duplicate.start()).rejects.toBeDefined();
    await duplicate.stop();
  });

  it('stop() resolves even when the server was never started', async () => {
    await expect(server.stop()).resolves.toBeUndefined();
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function request(method: string, port: number, body: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/',
        method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      resolve
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function tick(ms = 20): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
