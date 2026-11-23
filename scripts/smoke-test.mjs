// Checks through the gateway that the paths of the running system work.
// It needs the files that scripts/dev-setup.mjs creates and the containers of compose.
// The check of the finished games publishes its event with rabbitmqadmin in the RabbitMQ container.
//
// Usage: node scripts/smoke-test.mjs

import { spawn } from 'node:child_process';
import { randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (typeof tls.setDefaultCACertificates !== 'function' || typeof WebSocket !== 'function') {
  console.error('This script needs Node.js 22.19 or newer.');
  process.exit(1);
}

// Variables that are already set in the environment win over the .env file.
process.loadEnvFile(join(root, '.env'));

const gateway = `https://localhost:${process.env.GATEWAY_PORT}`;
const cookieName = '__Host-access-token';

// How long a check waits for the system, for example for a Socket.IO answer or a game in the history.
const timeoutSeconds = 10;

// A user that exists only in the token. The id is a UUID v7.
const user = { id: '0193c2b4-7d3e-7c2a-9f1e-3b5a6c7d8e9f', userName: 'smoke-test' };

// The certificate of the gateway is signed by the development CA, which Node does not know.
tls.setDefaultCACertificates([
  ...tls.getCACertificates('default'),
  readFileSync(join(root, 'secrets', 'tls', 'ca.crt'), 'utf8'),
]);

// Signs an access token with the development key, the way the platform-service does.
function createAccessToken() {
  const privateKey = readFileSync(join(root, 'secrets', 'jwt', 'private-key.pem'));
  const jwks = JSON.parse(readFileSync(join(root, 'secrets', 'jwt', 'jwks.json'), 'utf8'));
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'ES256', typ: 'JWT', kid: jwks.keys[0].kid };
  const payload = {
    iss: 'platform-service',
    aud: 'chess-platform',
    sub: user.id,
    preferred_username: user.userName,
    iat: now,
    exp: now + 300,
  };

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const signingInput = `${encode(header)}.${encode(payload)}`;

  // A JWT carries the two numbers of the ECDSA signature side by side, not in DER.
  const signature = sign('sha256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// A UUID v7 of RFC 9562, which starts with the milliseconds of the current time.
function uuidV7() {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// The example whiteWonByCheckmate of game-events.asyncapi.yaml with new ids and the current time, so every run
// checks a new game. Its white player is the user of the token.
function finishedGameEvent() {
  const endedAt = new Date();
  // The game of the example lasted 92.225 seconds.
  const startedAt = new Date(endedAt.getTime() - 92_225);
  return {
    id: uuidV7(),
    type: 'game.finished.v1',
    source: 'game-service',
    time: endedAt.toISOString(),
    data: {
      gameId: uuidV7(),
      variant: 'standard',
      white: { kind: 'user', userId: user.id, name: 'alice' },
      black: { kind: 'user', userId: '0193c2b5-1f2e-7d3c-8b4a-5c6d7e8f9a0b', name: 'bob' },
      result: 'whiteWon',
      reason: 'checkmate',
      moves: ['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4', 'g8f6', 'h5f7'],
      timeControl: { initialMs: 600000 },
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
    },
  };
}

// Publishes an event with rabbitmqadmin in the RabbitMQ container, as the README describes for a test event.
function publishEvent(event) {
  const properties = { delivery_mode: 2, content_type: 'application/json', message_id: event.id, type: event.type };
  const args = ['compose', 'exec', '-T', 'rabbitmq', 'rabbitmqadmin', '--non-interactive', 'publish', 'message',
    '--exchange', 'game.events', '--routing-key', 'game.finished', '--properties', JSON.stringify(properties),
    '--payload-file', '-'];

  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { cwd: root });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('error', (error) => reject(new Error(`could not run docker: ${error.message}`)));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`rabbitmqadmin failed: ${output.trim()}`));
      } else if (!output.includes('routed successfully')) {
        reject(new Error(`no queue got the event: ${output.trim()}`));
      } else {
        resolve();
      }
    });
    child.stdin.end(JSON.stringify(event));
  });
}

// Waits until the game is in the history of the user, which takes a moment after the event is published.
async function waitForGame(gameId, deadline = Date.now() + timeoutSeconds * 1000) {
  const response = await fetch(`${gateway}/api/games/${gameId}`, { headers: cookie });
  if (response.status === 200) {
    return;
  }

  expect(response.status === 404, `expected 200 or 404, got ${response.status}`);
  expect(Date.now() < deadline, `the game did not reach the history within ${timeoutSeconds} seconds`);
  await delay(250);
  return waitForGame(gameId, deadline);
}

async function expectCurrentUser(headers) {
  const response = await fetch(`${gateway}/api/users/me`, { headers });
  expect(response.status === 200, `expected 200, got ${response.status}`);

  const body = await response.json();
  expect(body.id === user.id, `expected the id ${user.id}, got ${body.id}`);
  expect(body.userName === user.userName, `expected the user name ${user.userName}, got ${body.userName}`);
}

async function expectPostStatus(path, headers, status) {
  const response = await fetch(`${gateway}${path}`, { method: 'POST', headers });
  expect(response.status === status, `expected ${status}, got ${response.status}`);
}

// The bucket of the sign-in in envoy/envoy.yaml, which gives every address 30 attempts at once and then one every
// 2 seconds (ADR-3).
const loginBucket = { maxTokens: 30, fillIntervalMs: 2000 };

function login(password, headers = {}) {
  return fetch(`${gateway}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ userName: user.userName, password }),
  });
}

// An earlier run may have used some of the attempts, so the check signs in with a wrong password until the gateway
// refuses. A gateway without the limit fails the check after twice as many attempts as the bucket holds.
async function expectLoginRateLimit() {
  const maxAttempts = 2 * loginBucket.maxTokens;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await login('not the password');
    await response.text();
    if (response.status === 429) {
      expect(
        !response.headers.get('content-type')?.includes('application/problem+json'),
        'expected the 429 of the gateway, not of the platform-service',
      );

      // The bucket is empty now, and a page of another site still cannot use it up. The check of the origin refuses
      // its POST before the limit counts it, and the GET of its images does not count.
      const crossSite = await login('not the password', { 'sec-fetch-site': 'cross-site' });
      expect(crossSite.status === 403, `expected 403 for a POST from another site, got ${crossSite.status}`);
      const get = await fetch(`${gateway}/api/auth/login`);
      expect(get.status !== 429, 'expected a GET not to count toward the limit');

      // Two tokens come back a little after two fill intervals. One is for the attempt below, and the other one is
      // for the check of the login of a run that starts right after this one.
      await delay(2 * loginBucket.fillIntervalMs + 100);
      const after = await login('not the password');
      expect(after.status === 401, `expected 401 once the limit lifts, got ${after.status}`);
      return;
    }

    expect(response.status === 401, `expected 401 or 429, got ${response.status}`);
  }

  throw new Error(`the gateway did not limit ${maxAttempts} attempts`);
}

// Opens a Socket.IO connection by hand. The server sends the open packet of Engine.IO,
// which starts with 0. The client asks for the default namespace with 40, and the server
// confirms it with a packet that starts with 40 too.
function connectSocketIo(path, headers) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${gateway.replace('https', 'wss')}${path}/?EIO=4&transport=websocket`, { headers });
    const timer = setTimeout(() => finish(new Error(`no answer within ${timeoutSeconds} seconds`)), timeoutSeconds * 1000);

    function finish(error) {
      clearTimeout(timer);
      socket.close();
      error ? reject(error) : resolve();
    }

    socket.addEventListener('error', () => finish(new Error('the WebSocket connection failed')));
    socket.addEventListener('message', ({ data }) => {
      if (data.startsWith('0')) {
        socket.send('40');
      } else if (data.startsWith('40')) {
        finish();
      } else {
        finish(new Error(`unexpected packet ${data}`));
      }
    });
  });
}

const token = createAccessToken();
const cookie = { cookie: `${cookieName}=${token}` };

const checks = [
  [
    'the SPA loads',
    async () => {
      const response = await fetch(`${gateway}/`);
      expect(response.status === 200, `expected 200, got ${response.status}`);
      expect(response.headers.get('content-type')?.includes('text/html'), 'expected an HTML page');
      expect((await response.text()).includes('id="root"'), 'expected the root element of the SPA');
    },
  ],
  [
    '/api/users/me without a token is rejected',
    async () => {
      const response = await fetch(`${gateway}/api/users/me`);
      expect(response.status === 401, `expected 401, got ${response.status}`);
    },
  ],
  ['/api/users/me with the token in the cookie returns the user', () => expectCurrentUser(cookie)],
  [
    '/api/users/me with the token in the Authorization header returns the user',
    () => expectCurrentUser({ authorization: `Bearer ${token}` }),
  ],
  // The 401 of a wrong password comes from the platform-service with a body, unlike the 401 of the gateway.
  // So it shows that the route works without a token and that the service reaches its database.
  [
    '/api/auth/login without a token reaches the platform-service',
    async () => {
      const response = await login('not the password');
      expect(response.status === 401, `expected 401, got ${response.status}`);
      expect(
        response.headers.get('content-type')?.includes('application/problem+json'),
        'expected the ProblemDetails of the platform-service',
      );
    },
  ],
  // A browser names the origin of a request that changes something, and the gateway refuses another origin.
  [
    '/api/auth/logout from another site is rejected',
    () => expectPostStatus('/api/auth/logout', { 'sec-fetch-site': 'cross-site', origin: 'https://another-origin.example' }, 403),
  ],
  [
    '/api/auth/logout from another origin of the same site is rejected',
    () => expectPostStatus('/api/auth/logout', { 'sec-fetch-site': 'same-site', origin: 'https://localhost:1' }, 403),
  ],
  [
    '/api/auth/logout from another origin without Sec-Fetch-Site is rejected',
    () => expectPostStatus('/api/auth/logout', { origin: 'https://another-origin.example' }, 403),
  ],
  [
    '/api/auth/logout from the own origin reaches the platform-service',
    () => expectPostStatus('/api/auth/logout', { 'sec-fetch-site': 'same-origin', origin: gateway }, 204),
  ],
  [
    '/ws/game without a token is rejected',
    async () => {
      const response = await fetch(`${gateway}/ws/game/?EIO=4&transport=websocket`);
      expect(response.status === 401, `expected 401, got ${response.status}`);
    },
  ],
  [
    '/ws/game from another origin is rejected',
    async () => {
      const headers = { ...cookie, origin: 'https://another-origin.example' };
      const response = await fetch(`${gateway}/ws/game/?EIO=4&transport=websocket`, { headers });
      expect(response.status === 403, `expected 403, got ${response.status}`);
    },
  ],
  // A browser names its own origin in the handshake, and the gateway is that origin.
  [
    '/ws/game with the token in the cookie connects',
    () => connectSocketIo('/ws/game', { ...cookie, origin: gateway }),
  ],
  ['/ws/spectate connects without a token', () => connectSocketIo('/ws/spectate', {})],
  [
    'a finished game on RabbitMQ reaches the history',
    async () => {
      const event = finishedGameEvent();
      await publishEvent(event);
      await waitForGame(event.data.gameId);
    },
  ],
];

// These checks use up a limit of the gateway that the checks above need, so they run after them.
const lastChecks = [['/api/auth/login is limited for an address', expectLoginRateLimit]];

console.log(`Smoke test of ${gateway}`);

// The checks of a list do not depend on each other, so they run at the same time.
const run = (list) => Promise.allSettled(list.map(async ([, check]) => check()));
const results = [...(await run(checks)), ...(await run(lastChecks))];
const allChecks = [...checks, ...lastChecks];

let failed = 0;
for (const [index, result] of results.entries()) {
  const [name] = allChecks[index];
  if (result.status === 'fulfilled') {
    console.log(`  ok      ${name}`);
    continue;
  }

  failed += 1;
  // A failed fetch keeps the reason, such as ECONNREFUSED, in its cause.
  const error = result.reason;
  const reason = error.cause?.message || error.cause?.code || error.message;
  console.log(`  FAILED  ${name}: ${reason}`);
}

console.log(failed === 0 ? 'All checks passed.' : `${failed} of ${allChecks.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
