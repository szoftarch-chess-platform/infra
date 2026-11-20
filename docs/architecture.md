# Architecture

The diagrams of the system at the context and container levels of the C4 model, and the main flows between the services. The diagrams inside a service are in the `docs/architecture.md` of its repo.

## System context

```mermaid
flowchart LR
    guest(["Guest"])
    user(["User"])
    platform["Online chess platform"]

    guest -->|"registers and signs in"| platform
    user -->|"plays live games, views past games"| platform
    guest -.->|"watches a game with a spectator link"| platform
```

The actors and their use cases are in [spec.md](spec.md). The platform depends on no external system at runtime.

## Containers

```mermaid
flowchart TB
    browser["Browser with the React SPA"]

    subgraph compose["Docker Compose project of the infra repo"]
        envoy["Envoy gateway"]
        frontend["frontend<br/>static file server"]
        platform["platform-service<br/>ASP.NET Core"]
        game["game-service<br/>NestJS"]
        engine["engine-service<br/>Python"]
        postgres[("PostgreSQL")]
        redis[("Redis")]
        rabbit[["RabbitMQ"]]
    end

    browser -->|"HTTPS, WSS"| envoy
    envoy -->|"static files"| frontend
    envoy -->|"REST"| platform
    envoy -->|"Socket.IO"| game
    game -->|"computer moves over HTTP"| engine
    game -->|"games in progress"| redis
    game -->|"finished games"| rabbit
    rabbit -->|"finished games"| platform
    platform -->|"users, game history"| postgres
```

[ADR-1](adr/microservices.md) decides the containers, [ADR-3](adr/api-gateway.md) the gateway, [ADR-5](adr/database.md) the database and [ADR-6](adr/service-communication.md) the calls between the services.

## Flows

### Sign-in and an authenticated request

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Envoy
    participant P as platform-service
    participant DB as PostgreSQL

    B->>E: login
    E->>P: login
    P->>DB: check the password, store the refresh token
    P-->>B: token cookies
    B->>E: request with the access token
    E->>E: validate the token
    E->>P: request with the identity headers
    P-->>B: response
```

[ADR-4](adr/authentication.md) decides the tokens, the cookies and the identity headers. The responses travel back through Envoy too.

### Live game against the AI

```mermaid
sequenceDiagram
    participant B as Browser
    participant E as Envoy
    participant G as game-service
    participant R as Redis
    participant X as engine-service

    B->>E: WebSocket connection with the access token
    E->>G: connection with the identity headers
    B->>G: move
    G->>G: check the move
    G->>R: save the position
    G-->>B: acknowledgement
    G->>X: request for the computer move
    X-->>G: computer move
    G->>R: save the position
    G-->>B: computer move
```

[ADR-3](adr/api-gateway.md) decides the connection, [ADR-6](adr/service-communication.md) the request for the computer move and [ADR-10](adr/live-game.md) which connections get the moves. Once the connection is open, the events travel on it through Envoy. Against a person, the game-service sends the move to every connection of the opponent instead.

### Handover of a finished game

```mermaid
sequenceDiagram
    participant G as game-service
    participant R as Redis
    participant Q as RabbitMQ
    participant P as platform-service
    participant DB as PostgreSQL

    G->>R: close the game, add the event to the outbox
    G->>Q: publish the event
    Q-->>G: confirm
    G->>R: remove the event from the outbox
    Q->>P: deliver the event
    P->>DB: store the game unless it was already processed
    P-->>Q: acknowledge
```

[ADR-6](adr/service-communication.md) decides the event, the outbox and the queue.
