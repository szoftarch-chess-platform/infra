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

- Docker with Compose 5.7.0 or newer, which `docker compose version` shows
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

If the build stops with `additional privileges requested`, update Docker Desktop or Compose to the version in the requirements. Do not turn off the check with `BUILDX_BAKE_ENTITLEMENTS_FS=0`.

Start everything and wait until it is healthy:
```bash
docker compose up -d --wait
```

The development override publishes these ports, which only the local machine reaches:

| Address | Service |
|---|---|
| `127.0.0.1:5432` | PostgreSQL, with the user `postgres` and the password `POSTGRES_PASSWORD` of `.env`, or on the database platform with the user `platform` and the password `PLATFORM_DB_PASSWORD` |
| `127.0.0.1:5672` | AMQP of RabbitMQ, with the user `game-service` and the password `GAME_RABBITMQ_PASSWORD` of `.env`, or the user `platform-service` and the password `PLATFORM_RABBITMQ_PASSWORD` |
| `127.0.0.1:6379` | Redis, with the user `game-service` and the password `GAME_REDIS_PASSWORD` of `.env` |
| http://127.0.0.1:8000 | engine-service |
| http://127.0.0.1:15672 | web management interface of RabbitMQ, with the user `admin` and the password `RABBITMQ_ADMIN_PASSWORD` of `.env` |

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

### Running a service on the host

A service runs on the host, for example with the hot reload of its dev server, against the addresses above. It listens on the same port as in its container, which is 8080 for the platform-service and 3001 for the game-service, and only on `127.0.0.1`. The platform-service needs PostgreSQL and RabbitMQ, and the game-service needs Redis, RabbitMQ and the engine-service. The README of the service describes its settings.

To reach it through the gateway, add the override file of the service to `COMPOSE_FILE` in `.env`.

| Service on the host | Override file |
|---|---|
| platform-service | `compose.platform-on-host.yaml` |
| game-service | `compose.game-on-host.yaml` |

For the platform-service the line looks like this:
```
COMPOSE_FILE=compose.yaml,compose.dev.yaml,compose.platform-on-host.yaml
```

Then start everything as usual. Compose removes the container of the service, and the gateway sends its requests to the host. For the platform-service the `platform-migrations` container still applies the migrations of its image.
```bash
docker compose up -d --wait
```

On Linux the service listens on the address of the Docker bridge instead of `127.0.0.1`. The address is 172.17.0.1 by default, and this command prints it:
```bash
docker network inspect bridge --format "{{(index .IPAM.Config 0).Gateway}}"
```
If a firewall such as ufw runs on the machine, it has to let the Docker networks reach the port of the service.

To switch back to the container, remove the override file from `COMPOSE_FILE` and start everything again.

Without the gateway it is enough to start the containers that the service needs, for example for the game-service:
```bash
docker compose up -d --wait redis rabbitmq engine-service
```

### Sending a test event

A test event goes to RabbitMQ through `rabbitmqadmin` in its container, with the payload of an example of `contracts/game-events.asyncapi.yaml` in JSON. Save the payload into a file such as `event.json`, and publish it with the properties that the contract requires:
```bash
docker compose exec -T rabbitmq rabbitmqadmin publish message \
  --exchange game.events --routing-key game.finished \
  --properties '{"delivery_mode": 2, "content_type": "application/json", "message_id": "<id of the event>", "type": "game.finished.v1"}' \
  --payload-file - < event.json
```

The game-service declares the `game.events` exchange when it starts. Without the game-service declare it yourself:
```bash
docker compose exec rabbitmq rabbitmqadmin declare exchange --name game.events --type topic --durable true
```

The platform-service puts an event that it cannot process into the queue `platform.game-finished.dlq`, which the web management interface shows. The smoke test sends the example `whiteWonByCheckmate` the same way.

### Configuration

Compose reads its variables from `.env`, and every one of them is required.

| Variable | Description |
|---|---|
| `COMPOSE_FILE`, `COMPOSE_PATH_SEPARATOR` | compose files that every `docker compose` command loads |
| `FRONTEND_TAG`, `GAME_SERVICE_TAG`, `ENGINE_SERVICE_TAG`, `PLATFORM_SERVICE_TAG` | image tag of each service |
| `GATEWAY_PORT` | host port of the gateway |
| `POSTGRES_PASSWORD` | password of the postgres superuser |
| `PLATFORM_DB_PASSWORD` | password of the database user of the platform-service |
| `GAME_REDIS_PASSWORD` | password of the Redis user of the game-service |
| `RABBITMQ_ADMIN_PASSWORD` | password of the admin user of RabbitMQ |
| `GAME_RABBITMQ_PASSWORD` | password of the RabbitMQ user of the game-service |
| `PLATFORM_RABBITMQ_PASSWORD` | password of the RabbitMQ user of the platform-service |

`scripts/dev-setup.mjs` copies .env.example to .env and fills the empty passwords with random values. To an existing .env it adds the variables of .env.example that it lacks, so run the script again after every pull that changes .env.example. It creates only the files that are missing in the secrets folder. To renew a key, the certificate or `.env`, delete it and run the script again.

The passwords of the database and the users of RabbitMQ with their passwords and permissions take effect only on an empty data volume. To apply a change of `rabbitmq/rabbitmq.conf` or of a RabbitMQ password, delete the volume of RabbitMQ and start everything again. The messages in its queues are lost.
```bash
docker compose down
docker volume rm chess-platform_rabbitmq-data
docker compose up -d --wait
```

RabbitMQ imports the policies of `rabbitmq/definitions.json` at every start, so a change of them needs only a restart:
```bash
docker compose restart rabbitmq
```

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

Restart the gateway after a change of envoy/envoy.yaml:
```bash
docker compose restart envoy
```

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
├── compose.*-on-host.yaml    # overrides that send the requests of the gateway to a service on the host
├── .env.example              # variables of the compose files
├── contracts/                # contracts between the services and the configuration of their linter
├── envoy/
│   └── envoy.yaml            # configuration of the gateway
├── postgres/
│   └── init/                 # scripts that run when the database is first created
├── rabbitmq/
│   ├── rabbitmq.conf         # users of RabbitMQ with their permissions
│   └── definitions.json      # default virtual host and the policies of the queues
├── scripts/
│   ├── dev-setup.mjs         # creates the keys, the certificate and .env
│   └── smoke-test.mjs        # checks the paths through the gateway
├── secrets/                  # keys and certificates, outside version control
└── docs/                     # system documentation
```
