# infra

Deployment and system documentation of the online chess platform.

## Workspace

Clone the five repos next to each other into one folder and switch them to the `dev` branch.

```bash
mkdir chess-platform && cd chess-platform
for repo in frontend game-service engine-service platform-service infra; do
  git clone "https://github.com/szoftarch-chess-platform/$repo.git"
  git -C "$repo" switch dev
done
```

The same in PowerShell:

```powershell
mkdir chess-platform; cd chess-platform
foreach ($repo in 'frontend', 'game-service', 'engine-service', 'platform-service', 'infra') {
  git clone "https://github.com/szoftarch-chess-platform/$repo.git"
  git -C $repo switch dev
}
```

The result is this layout:

```
chess-platform/
├── frontend/
├── game-service/
├── engine-service/
├── platform-service/
└── infra/
```

## Documentation

The documentation of the whole system starts at [docs/README.md](docs/README.md).

## Deployment

The compose files run the whole system. [ADR-2](docs/adr/polyrepo.md) decides how they are split.

### Requirements

- Docker with Compose
- Node.js 22.19 or newer for the scripts

### Running locally

Run the commands below in the `infra` folder.

Create the keys, the certificate and .env:
```bash
node scripts/dev-setup.mjs
```

Build the images of the services from the sibling folders:
```bash
docker compose build
```
To build only the service that you work on, name it, for example:
```bash
docker compose build game-service
```
To use the released image of a service, set its tag in `.env` to the released version.

Start everything and wait until it is healthy:
```bash
docker compose up -d --wait
```

The development override publishes these ports, which only the local machine reaches:

| Address | Service |
|---|---|
| `127.0.0.1:6379` | Redis |
| `127.0.0.1:5672` | AMQP of RabbitMQ |
| http://127.0.0.1:15672 | web management interface of RabbitMQ, with the user `admin` and the password `RABBITMQ_ADMIN_PASSWORD` of `.env` |

To run a service on the host, for example with the hot reload of its dev server, start only the containers that it needs. The platform-service needs RabbitMQ, and the game-service needs Redis and RabbitMQ. Starting only the Redis and the RabbitMQ looks like this:
```bash
docker compose up -d --wait redis rabbitmq
```

Check the paths through the gateway:
```bash
node scripts/smoke-test.mjs
```

The system runs at https://localhost:8443.

Stop the containers keeping the data:
```bash
docker compose down
```

Or stop the containers deleting the data:
```bash
docker compose down --volumes
```

### Configuration

Compose reads its variables from `.env`, and every one of them is required.

| Variable | Description |
|---|---|
| `COMPOSE_FILE`, `COMPOSE_PATH_SEPARATOR` | compose files that every `docker compose` command loads |
| `FRONTEND_TAG`, `GAME_SERVICE_TAG`, `ENGINE_SERVICE_TAG`, `PLATFORM_SERVICE_TAG` | image tag of each service |
| `GATEWAY_PORT` | host port of the gateway |
| `POSTGRES_PASSWORD` | password of the postgres superuser |
| `PLATFORM_DB_PASSWORD` | password of the database user of the platform-service |
| `RABBITMQ_ADMIN_PASSWORD` | password of the admin user of RabbitMQ |

`scripts/dev-setup.mjs` copies .env.example to .env and fills the empty passwords with random values. It creates only the files that are missing in the secrets folder. To renew a key, the certificate or `.env`, delete it and run the script again. The database passwords take effect only on an empty data volume.

### Checking the config files

Check compose.yaml:
```bash
docker compose config --quiet
```

Check envoy/envoy.yaml:
```bash
docker compose run --rm --no-deps envoy --mode validate -c /etc/envoy/envoy.yaml
```

In Git Bash start the second command with `MSYS_NO_PATHCONV=1`, otherwise Git Bash rewrites the path of the configuration.

Check the contracts in `contracts/`:
```bash
npx --yes @redocly/cli@2.82.0 lint --config contracts/redocly.yaml
```

### Trusting the certificate

The browser warns about the certificate of the gateway until the development CA in `secrets/tls/ca.crt` is trusted. Trust it once, and again when you create a new one.

On Windows, in PowerShell from the `infra` folder:
```powershell
Import-Certificate -FilePath secrets\tls\ca.crt -CertStoreLocation Cert:\CurrentUser\Root
```
You can check it by pressing `Win + R` and opening `certmgr.msc`. It should be in the Trusted Root Certification Authorities/Certificates folder.

On macOS from the `infra` folder:
```bash
security add-trusted-cert -r trustRoot -k ~/Library/Keychains/login.keychain-db secrets/tls/ca.crt
```

On Linux import `secrets/tls/ca.crt` as an authority in the certificate settings of the browser.

### File structure

```
infra/
├── compose.yaml              # base compose file with the released images
├── compose.dev.yaml          # override that builds the services from the sibling folders and publishes the ports for development
├── .env.example              # variables of the compose files
├── contracts/                # contracts between the services and the configuration of their linter
├── envoy/
│   └── envoy.yaml            # configuration of the gateway
├── postgres/
│   └── init/                 # scripts that run when the database is first created
├── scripts/
│   ├── dev-setup.mjs         # creates the keys, the certificate and .env
│   └── smoke-test.mjs        # checks the paths through the gateway
├── secrets/                  # keys and certificates, outside version control
└── docs/                     # system documentation
```
