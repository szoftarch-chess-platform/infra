// Creates the files of the local development setup that stay outside version control.
// These are the key pair and the JWKS of the access tokens, the certificate of the gateway
// and the .env file of compose.
//
// The script creates only what is missing. To renew a file, delete it and run the script again.
//
// Usage: node scripts/dev-setup.mjs

import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// OpenSSL runs in a container, so the host needs no OpenSSL of its own.
const OPENSSL_IMAGE = 'alpine:3.24';

// The certificate authority signs one certificate for localhost. Its key never leaves
// the container, so nobody can sign another certificate with it.
const CERTIFICATE_SCRIPT = `
set -eu

# Everything except the final result goes to stderr.
exec 3>&1 1>&2

apk add --no-cache --quiet openssl
cd "$(mktemp -d)"

cat > ca.cnf <<EOF
[req]
distinguished_name = name
x509_extensions = extensions
prompt = no
[name]
CN = Chess platform development CA
[extensions]
basicConstraints = critical, CA:TRUE, pathlen:0
keyUsage = critical, keyCertSign
subjectKeyIdentifier = hash
EOF

cat > gateway.ext <<EOF
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = serverAuth
subjectAltName = DNS:localhost, IP:127.0.0.1, IP:::1
authorityKeyIdentifier = keyid
EOF

openssl req -x509 -config ca.cnf -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -days 825 -keyout ca.key -out ca.crt
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc -subj /CN=localhost -keyout gateway.key -out gateway.csr
openssl x509 -req -in gateway.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -extfile gateway.ext -out gateway.crt

cat ca.crt gateway.crt gateway.key >&3
`;

function path(...parts) {
  return join(root, ...parts);
}

function write(target, content) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`created ${relative(root, target)}`);
}

function keep(target) {
  console.log(`kept    ${relative(root, target)}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

// The ES256 key pair that signs the access tokens. The private key is for the
// platform-service, and the gateway reads the public key from the JWKS.
function createTokenKeys() {
  const privateKeyPath = path('secrets', 'jwt', 'private-key.pem');
  const jwksPath = path('secrets', 'jwt', 'jwks.json');

  // The JWKS is derived from the private key, so a new key always gets a new JWKS.
  if (existsSync(privateKeyPath) && existsSync(jwksPath)) {
    keep(privateKeyPath);
    keep(jwksPath);
    return;
  }

  if (existsSync(privateKeyPath)) {
    keep(privateKeyPath);
  } else {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    write(privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  }

  const publicKey = createPublicKey(readFileSync(privateKeyPath));
  const { crv, kty, x, y } = publicKey.export({ format: 'jwk' });

  // The kid is the JWK thumbprint of RFC 7638, which is the SHA-256 hash of the
  // required members in alphabetical order. Anyone who has the key can compute it.
  const kid = createHash('sha256').update(JSON.stringify({ crv, kty, x, y })).digest('base64url');

  const jwks = { keys: [{ kty, crv, x, y, kid, use: 'sig', alg: 'ES256' }] };
  write(jwksPath, `${JSON.stringify(jwks, null, 2)}\n`);
}

// The certificate authority and the certificate of the gateway for https://localhost.
function createGatewayCertificate() {
  const targets = ['ca.crt', 'gateway.crt', 'gateway.key'].map((name) => path('secrets', 'tls', name));

  // The three files belong together, so they are created together.
  if (targets.every((target) => existsSync(target))) {
    targets.forEach(keep);
    return;
  }

  const result = spawnSync('docker', ['run', '--rm', '-i', OPENSSL_IMAGE, 'sh'], {
    input: CERTIFICATE_SCRIPT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  if (result.error) {
    fail(`Could not run docker: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Creating the certificate failed in the ${OPENSSL_IMAGE} container.`);
  }

  const blocks = result.stdout.match(/-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----\n/g);
  if (blocks?.length !== targets.length) {
    fail('The container did not return the two certificates and the key.');
  }
  targets.forEach((target, index) => write(target, blocks[index]));
}

// The .env file is a copy of .env.example in which every empty password gets a random value.
function createEnvFile() {
  const envPath = path('.env');
  if (existsSync(envPath)) {
    keep(envPath);
    return;
  }

  const example = readFileSync(path('.env.example'), 'utf8');
  const env = example.replace(
    /^(\w+PASSWORD)=(?=\r?$)/gm,
    (_, name) => `${name}=${randomBytes(24).toString('hex')}`,
  );
  write(envPath, env);
}

createTokenKeys();
createGatewayCertificate();
createEnvFile();
