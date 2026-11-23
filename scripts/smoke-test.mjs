// Checks through the gateway that the paths of the running system work.
// It needs the files that scripts/dev-setup.mjs creates and the containers of compose.
//
// Usage: node scripts/smoke-test.mjs

import { sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

// Opens a Socket.IO connection by hand. The server sends the open packet of Engine.IO,
// which starts with 0. The client asks for the default namespace with 40, and the server
// confirms it with a packet that starts with 40 too.
function connectSocketIo(path, headers) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${gateway.replace('https', 'wss')}${path}/?EIO=4&transport=websocket`, { headers });
    const timer = setTimeout(() => finish(new Error('no answer within 10 seconds')), 10_000);

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
      const response = await fetch(`${gateway}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userName: user.userName, password: 'not the password' }),
      });
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
];

console.log(`Smoke test of ${gateway}`);

// The checks do not depend on each other, so they run at the same time.
const results = await Promise.allSettled(checks.map(async ([, check]) => check()));

let failed = 0;
for (const [index, result] of results.entries()) {
  const [name] = checks[index];
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

console.log(failed === 0 ? 'All checks passed.' : `${failed} of ${checks.length} checks failed.`);
process.exit(failed === 0 ? 0 : 1);
