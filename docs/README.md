# System documentation

The documentation of the online chess platform as a whole.

| Document | Content |
|---|---|
| [spec.md](spec.md) | requirements |
| [architecture.md](architecture.md) | diagrams of the system |
| [conventions.md](conventions.md) | rules for working in the repos |
| [adr-guide.md](adr-guide.md) | how ADRs are written and changed |

## System ADRs

| ID | Title | Affects |
|---|---|---|
| [ADR-1](adr/microservices.md) | Microservice architecture and technologies | all repos |
| [ADR-2](adr/polyrepo.md) | Polyrepo with one repo per deployment unit | all repos |
| [ADR-3](adr/api-gateway.md) | Envoy as the API gateway | infra, frontend, game-service, platform-service |
| [ADR-4](adr/authentication.md) | Authentication with JWT validation in the gateway | infra, frontend, game-service, platform-service |
| [ADR-5](adr/database.md) | PostgreSQL for long-term storage | infra, platform-service |
| [ADR-6](adr/service-communication.md) | Communication between the services | infra, game-service, engine-service, platform-service |
