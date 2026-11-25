// Creates the files of the local development setup that stay outside version control.
// These are the key pair and the JWKS of the access tokens, the certificate of the gateway
// and the .env file of compose.
//
// The script creates only what is missing, and it adds the variables of .env.example that an
// existing .env lacks. To renew a file, delete it and run the script again.
//
// It also writes the settings of the services that run on the host, which it derives from .env,
// so it writes them again at every run.
//
// Usage: node scripts/dev-setup.mjs

import { spawnSync } from 'node:child_process';
import { createHash, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A placeholder of a template of a service, which stands for the value of the variable NAME.
const PLACEHOLDER = /<([A-Z][A-Z0-9_]*)>/g;

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

function write(target, content, verb = 'created') {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  console.log(`${verb.padEnd(7)} ${relative(root, target)}`);
}

function keep(target) {
  console.log(`kept    ${relative(root, target)}`);
}

function skip(what, reason) {
  console.log(`skipped ${what}, because ${reason}`);
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

// Gives every empty password a random value.
function fillPasswords(text) {
  return text.replace(/^(\w+PASSWORD)=(?=\r?$)/gm, (_, name) => `${name}=${randomBytes(24).toString('hex')}`);
}

// The .env file is a copy of .env.example in which every empty password gets a random value.
// An existing .env keeps its values and gets the variables that it lacks, with their comments,
// so an existing setup gets a new password without losing its data.
function createEnvFile() {
  const envPath = path('.env');
  const example = readFileSync(path('.env.example'), 'utf8');

  if (!existsSync(envPath)) {
    write(envPath, fillPasswords(example));
    return;
  }

  const env = readFileSync(envPath, 'utf8');
  const existing = new Set(Array.from(env.matchAll(/^(\w+)=/gm), (match) => match[1]));
  const missing = Array.from(example.matchAll(/^(?:#.*\r?\n)*(\w+)=.*$/gm)).filter(
    (match) => !existing.has(match[1]),
  );

  if (missing.length === 0) {
    keep(envPath);
    return;
  }

  const additions = missing.map((match) => fillPasswords(match[0].replace(/\r$/, ''))).join('\n\n');
  const separator = env.endsWith('\n') ? '\n' : '\n\n';
  writeFileSync(envPath, `${env}${separator}${additions}\n`);
  console.log(`added   ${missing.map((match) => match[1]).join(', ')} to ${relative(root, envPath)}`);
}

// The path of a file in the repo of a service, which is a sibling folder of infra.
function servicePath(repo, ...parts) {
  return join(root, '..', repo, ...parts);
}

// Reads the template of a service, or returns undefined when its repo or the template is missing.
function readTemplate(repo, name, what) {
  const templatePath = servicePath(repo, name);
  if (!existsSync(templatePath)) {
    skip(what, `${relative(root, templatePath)} is missing`);
    return undefined;
  }

  return readFileSync(templatePath, 'utf8');
}

// Replaces every placeholder of the template with its value, which encode prepares for the format of the template.
function fillTemplate(template, values, source, encode = (value) => value) {
  return template.replace(PLACEHOLDER, (placeholder, name) => {
    if (!values[name]) {
      fail(`${source} has the placeholder ${placeholder}, but it has no value.`);
    }

    return encode(values[name]);
  });
}

// The game-service reads .env, and the template of its repo is .env.example.
function writeGameServiceSettings(values) {
  const what = 'the settings of the game-service';
  const template = readTemplate('game-service', '.env.example', what);
  if (template === undefined) {
    return;
  }

  const eol = template.includes('\r\n') ? '\r\n' : '\n';
  const header = [
    '# Written by scripts/dev-setup.mjs of the infra repo from .env.example at every run, so a change here is lost.',
    '# Values of your own go into .env.local, which wins over this file.',
  ].join(eol);
  const settings = fillTemplate(template, values, relative(root, servicePath('game-service', '.env.example')));
  write(servicePath('game-service', '.env'), `${header}${eol}${settings}`, 'wrote');
}

// The platform-service reads the user secrets of .NET in Development, and the template of its repo is a JSON file
// with the same structure as appsettings.json. The secrets that the template lacks stay as they are.
function setPlatformServiceSecrets(values) {
  const what = 'the user secrets of the platform-service';
  const template = readTemplate('platform-service', 'user-secrets.template.json', what);
  if (template === undefined) {
    return;
  }

  // The values go into JSON strings, so their backslashes and quotes are escaped.
  const secrets = fillTemplate(
    template,
    values,
    relative(root, servicePath('platform-service', 'user-secrets.template.json')),
    (value) => JSON.stringify(value).slice(1, -1),
  );

  // The output of the tool would show the secrets, so only its errors are shown.
  const project = servicePath('platform-service', 'src', 'PlatformService.Api');
  const result = spawnSync('dotnet', ['user-secrets', 'set', '--project', project], {
    input: secrets,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  if (result.error?.code === 'ENOENT') {
    skip(what, 'the .NET SDK is missing');
    return;
  }
  if (result.error) {
    fail(`Could not run dotnet: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`Setting ${what} failed.`);
  }
  console.log(`set     ${what}`);
}

// The settings of the services that run on the host. The template of a service is in its repo, and
// a placeholder <NAME> of it stands for the variable NAME of .env or for a path that the script adds.
function writeHostSettings() {
  const values = {
    ...parseEnv(readFileSync(path('.env'), 'utf8')),
    JWT_SIGNING_KEY_PATH: path('secrets', 'jwt', 'private-key.pem'),
  };

  writeGameServiceSettings(values);
  setPlatformServiceSecrets(values);
}

createTokenKeys();
createGatewayCertificate();
createEnvFile();
writeHostSettings();
