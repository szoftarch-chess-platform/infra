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

## Next steps of infra

- Lint the contracts in a CI workflow for every pull request that changes `contracts/` (ADR-7).
