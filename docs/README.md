# System documentation

The documentation of the online chess platform as a whole.

| Document | Content |
|---|---|
| [spec.md](spec.md) | requirements |
| [architecture.md](architecture.md) | diagrams of the system |
| [conventions.md](conventions.md) | rules for working in the repos |
| [adr-guide.md](adr-guide.md) | how ADRs are written and changed |

## Contracts

The contracts between the services, which [ADR-7](adr/contracts.md) and [ADR-8](adr/contract-conventions.md) describe.

| Contract | Interface | Provider | Consumer |
|---|---|---|---|
| [platform-service.openapi.yaml](../contracts/platform-service.openapi.yaml) | REST API under `/api` | platform-service | frontend |
| [game-service.asyncapi.yaml](../contracts/game-service.asyncapi.yaml) | Socket.IO events on `/ws/game` | game-service | frontend |
| [engine-service.openapi.yaml](../contracts/engine-service.openapi.yaml) | move request | engine-service | game-service |
| [game-events.asyncapi.yaml](../contracts/game-events.asyncapi.yaml) | events on RabbitMQ | game-service | platform-service |
| [shared-schemas.yaml](../contracts/shared-schemas.yaml) | schemas that several contracts use | | |

## System ADRs

| ID | Title | Affects |
|---|---|---|
| [ADR-1](adr/microservices.md) | Microservice architecture and technologies | all repos |
| [ADR-2](adr/polyrepo.md) | Polyrepo with one repo per deployment unit | all repos |
| [ADR-3](adr/api-gateway.md) | Envoy as the API gateway | infra, frontend, game-service, platform-service |
| [ADR-4](adr/authentication.md) | Authentication with JWT validation in the gateway | infra, frontend, game-service, platform-service |
| [ADR-5](adr/database.md) | PostgreSQL for long-term storage | infra, platform-service |
| [ADR-6](adr/service-communication.md) | Communication between the services | infra, game-service, engine-service, platform-service |
| [ADR-7](adr/contracts.md) | Design-first contracts | all repos |
| [ADR-8](adr/contract-conventions.md) | Data conventions of the contracts | all repos |
| [ADR-9](adr/chess-rules.md) | chess.js for the rules of chess | frontend, game-service |
| [ADR-10](adr/live-game.md) | Rules of a live game | frontend, game-service, platform-service |

## Open questions of infra

- The open question of [ADR-3](adr/api-gateway.md) on the size of the rate limit of the sign-in.
- The open question of [ADR-6](adr/service-communication.md) on the passwords of the RabbitMQ users.
- How compose waits until the platform-service is ready, because its chiseled image has no shell for a health check.

## Next steps of infra

The services stop at startup without a required setting, so the settings below go into compose before the services start to read them.

- Create the RabbitMQ users of the game-service and the platform-service with the permissions of ADR-6, answering its open question on the passwords, and pass `RABBITMQ_URL` and `ENGINE_URL` to the game-service and `ConnectionStrings__RabbitMq` to the platform-service.
- Lint the contracts in a CI workflow for every pull request that changes `contracts/` (ADR-7).
- Describe in the README how to send a test event with `rabbitmqadmin`, including the declaration of the `game.events` exchange when the game-service has not declared it yet (ADR-7).
- Answer the open question of ADR-3 on the size of the rate limit, and add the rate limit of the sign-in to the gateway.
