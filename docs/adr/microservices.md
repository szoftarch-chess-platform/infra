# ADR-1: Microservice architecture and technologies

**Related:** F-4, NF-5, NF-6, NF-8, NF-9, X-1, X-2, X-3, X-4, X-5, X-6, X-7, [ADR-5](database.md), [ADR-6](service-communication.md)

## Context

The system has to serve real-time live games, a resource-intensive AI opponent and less critical features such as user management, game history and the leaderboard.

## Decision

Microservice architecture with this split:

| Component | Technology | Responsibility |
|---|---|---|
| frontend | React SPA | browser client |
| game-service | NestJS | games in progress, real-time communication |
| engine-service | Python | AI opponent, computer move generation |
| platform-service | ASP.NET Core | user management and every other feature |

The data of the games in progress is in Redis, and all data that needs long-term storage goes into an SQL database.

The chess rules are checked and the chess engine is provided by external libraries. We do not implement them ourselves.

Every component that the system runs, such as the gateway, the database and the broker, is free and open source.

The game-service checks whether a move is legal, and it is the authority on the state of a game. The frontend does not decide on legality.

The first version implements the core features. The extra features are not part of it, but the interfaces and the data model are shaped so that the system can be extended with them with few changes.

## Rationale

This way the real-time game and the resource-intensive chess engine are separated from the less critical features, and the engine-service can be scaled separately.

## Consequences

- It is a distributed system. It needs a common entry point, and the communication between the services has to be designed as well.
- There are three languages, TypeScript, C# and Python. The contracts between the services, which are REST APIs, WebSocket events and broker messages, have to be kept in sync across the languages.
