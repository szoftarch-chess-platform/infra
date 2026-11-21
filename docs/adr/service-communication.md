# ADR-6: Communication between the services

**Related:** F-2, F-6, NF-3, NF-6, NF-8, NF-9, X-3, X-4, X-6, [ADR-1](microservices.md), [ADR-2](polyrepo.md), [ADR-3](api-gateway.md), [ADR-4](authentication.md), [ADR-5](database.md), [ADR-7](contracts.md), [ADR-8](contract-conventions.md), [ADR-10](live-game.md)

## Context

The services call each other in two places, and the two calls are different in nature:

- In a game against the AI the game-service asks the engine-service for the computer move. This is request-response, because the game cannot go on without the answer.
- The game-service hands the finished game over to the platform-service, which stores it permanently. This has to happen even if the platform-service is not running at that moment. Later extensions, such as the Élő rating or challenging friends, would build on the same or similar events.

An internal call must not reach the services that trust the identity headers of the gateway.

## Decision

The two calls get two integration styles.

- **Move request with synchronous HTTP:** the game-service calls the engine-service directly by its service name in compose, with REST/JSON. The request contains only the position in FEN, and the move comes back in UCI notation. The engine-service answers within the time limit of its contract. The game-service waits five seconds longer than that, and it repeats a failed request once. The engine-service reads no identity headers, and it is on an internal Docker network that it shares only with the game-service. The first version runs one engine instance.
- **Handover of the game with asynchronous messaging over RabbitMQ:** the game-service publishes the finished game as an event to a durable topic exchange named `game.events` with the routing key `game.finished`. The event carries the result of the game and its full move list. The platform-service consumes it from its own durable quorum queue named `platform.game-finished`, and it acknowledges only after the database transaction has been committed.
- **Reliable sending with a transactional outbox:** the game-service writes the event to an outbox list in the same Redis transaction in which it closes the game, and it sends the event on from there with publisher confirms and the mandatory flag. If the broker cannot be reached, or it returns the event because no queue is bound to its routing key, the event waits in the outbox. Redis has AOF persistence turned on, so the games in progress and the outbox survive a restart too.
- **Idempotent consumption:** the platform-service filters out repeated deliveries by the id of the event, and a message that cannot be processed goes to a dead-letter queue after the delivery limit.
- **Message format:** JSON with a common envelope of `id` as a UUID, `type` with a version such as `game.finished.v1`, `source`, `time` and `data`. The schemas are written in AsyncAPI among the contracts of `infra`.
- **Topology:** every service declares what it owns at startup. The sender declares the exchange, and the consumer declares its own queue and binding. The declarations are idempotent. A consumer that starts before the exchange exists repeats its binding until the sender has declared the exchange.
- **Operation:** RabbitMQ 4.4 runs as one instance in the compose of `infra` from the official `rabbitmq:4.4-management-alpine` image, and every service connects with its own user. Redis 8.8 runs as one instance from the official `redis:8.8-alpine` image. Only the user `game-service` can sign in to Redis, with the password `GAME_REDIS_PASSWORD` of `.env`. It may use every command except the administrative ones of the `@admin` category, and the default user of Redis is turned off.
- **Networks:** every container joins only the networks that it needs. The gateway, the frontend, the platform-service and the game-service share the default network. Each data store has a network of its own with the services that use it, so PostgreSQL is on the `postgres` network with the platform-service, Redis on the `redis` network with the game-service, and RabbitMQ on the `rabbitmq` network with both. The engine-service stays on its internal `engine` network.
- **Local development:** only the local development override file publishes ports of RabbitMQ, Redis and the engine-service, and only on `127.0.0.1`. These are AMQP on 5672, the web management interface on 15672, Redis on 6379 and the engine-service on 8000. ADR-5 publishes the port of the database the same way. A port cannot be published from an internal network, so in development the engine-service also joins a network that no other container uses. A service under development runs on the host against these ports, with the same users and permissions as in compose. It listens on the same port as in its container, but only on `127.0.0.1`, and on Linux on the address of the Docker bridge. In the container it listens on every interface. The listen address comes from the configuration of the service, which is `HOST` for the game-service and the engine-service. For each service that the gateway routes to, an override file in `infra` sets its container to zero instances and maps its service name in the gateway container to the host with `host-gateway`, so the gateway reaches the service on the host with the same Envoy configuration.
- **Permissions:** the names of the exchanges and the queues of a service begin with its prefix, which is `game.` for the game-service and `platform.` for the platform-service. A service may configure, write and read only the resources with its own prefix, and the platform-service may also read `game.events`, which it needs to bind its queue. Every service uses the default virtual host.
- **Settings:** the game-service reads the AMQP URI of the broker with its own user from `RABBITMQ_URL`, the URL of Redis with its user from `REDIS_URL` and the address of the engine-service from `ENGINE_URL`. The platform-service reads the AMQP URI from the `ConnectionStrings:RabbitMq` setting. The URIs end in `/%2f`, which names the default virtual host.

## Rationale

- The move request is a remote procedure call, while the handover of the game is messaging, which is loosely coupled, and the broker guarantees the delivery.
- The move request is request-response, so synchronous HTTP is the natural choice. In compose the service name is the service discovery, so the call needs no extra component. Repeating the request is safe, because the same position can be asked again at any time.
- The handover of the game needs a message queue, not a stream. Every finished game has to be processed once by each consumer, and the durable store of the games is the database of the platform-service, so the broker does not have to keep a replayable event log. If one is needed later, RabbitMQ also offers streams in the same broker.
- RabbitMQ is the best known open-source message broker under MPL 2.0, and the quorum queue is its recommended queue type when data safety matters. Publisher confirms and consumer acknowledgements together give at-least-once delivery. A new consumer can be bound to the topic exchange without changing the sender, and the web management interface shows the path of the messages.
- The platform-service does not have to open an internal HTTP endpoint, so it does not have to authenticate a caller that does not come through the gateway.
- The outbox and the idempotent consumer cover the two ends of at-least-once delivery. The event is not lost, and a repeated delivery does not create a duplicate game.
- The broker also confirms a message that it routes to no queue. Without the mandatory flag, the games that end before the platform-service has bound its queue would be lost, for example when the platform-service starts later than the game-service.
- A new game mode adds an optional variant field to the move request, which is a compatible change by ADR-7, and the events already carry the variant (ADR-8).
- The time limit is part of the contract of the engine, so the engine-service chooses its thinking time below it, and the five extra seconds of the game-service cover the network and the work around the search.
- With the prefixes a service cannot change or read the resources of another service by mistake, and a new queue of the same service needs no new permission.
- A service on the host gets the hot reload of its dev server and writes its logs straight to the terminal, while it still uses the images, the users and the permissions of compose, which is the dev/prod parity of the twelve-factor app. A published port listens on every interface by default, and on `127.0.0.1` only the same machine reaches it.
- Through the override file the browser, the frontend and the smoke test reach the service on the host through the gateway, with the JWT validation and the identity headers of compose. Only the address behind the service name changes, so `envoy.yaml` is the same in every setup.
- The service takes its port from its configuration and uses the same one on the host and in the container, which is the port binding of the twelve-factor app. So the gateway needs no port for each setup.
- A game-service on the host calls the real engine-service, and the engine-service still shares a network only with the game-service.
- The services trust the identity headers of the gateway, so only the gateway may reach them. A service on the host that listened on every interface would be reachable from the local network, for example on a shared Wi-Fi, and anyone there could send the headers of any user. On Linux `host-gateway` is the address of the Docker bridge, and listening on that address alone keeps the service away from the local network too.
- The networks follow least privilege, which is defense in depth. The gateway at the edge and the frontend reach no data store, so a fault in them does not expose the data. A data store is reached only by the services that use it, which also enforces the database per service of ADR-5 on the network.
- The networks of the data stores are not internal, because the development override cannot publish a port from an internal network.
- The official Redis image turns the protected mode off, so without a user every container on its network had full access. With the default user turned off, a client without the password cannot read or change the games, and the user of the game-service cannot change the configuration or stop the server.
- One URI carries the host, the user and the password in a single setting, and the RabbitMQ clients of Node.js and .NET accept it. By the URI specification of RabbitMQ a trailing `/` alone would name an empty virtual host, and a missing path is left to the client.
- Redis is open source again since version 8, which is also available under AGPLv3. Version 7.4 has only source-available licenses.
- The image tags follow the patch releases of one release line. Fixes arrive without a change, and moving to a new release line is a deliberate step.

## Rejected alternatives

- **Synchronous REST call to the platform-service at the end of the game:** if the platform-service is not running, the game is not saved, or the game-service has to retry.
- **Redis Streams:** no new component is needed, but the platform-service would connect to the own Redis store of the game-service, and redelivery, dead-letter handling and monitoring would have to be written by hand.
- **Apache Kafka:** a replayable event log with high throughput, which is not needed here, and it is much harder to operate.
- **NATS JetStream:** light and durable, but it has no built-in graphical management interface.
- **The service under development in compose with Compose Watch:** every service would need a development setup of its own in `infra`, and a change would need a new image or a restart of the container.
- **Another port on the host with a port for each setup in the Envoy configuration:** Envoy reads no environment variables in its static configuration, so `envoy.yaml` would need a template or a second copy, and the port would differ between the host and the container.
- **The engine-service on the default network in development:** simpler, but in development every container would reach it.
- **One back-end network for every data store:** simpler, but every service would reach the data stores of the others.
- **A password for the default user of Redis with `requirepass`:** simpler, but the default user would keep the administrative commands.
- **Commands without the `@dangerous` category for the user of Redis:** stricter, but that category also contains `INFO`, which Redis clients such as ioredis send when they connect.
- **Own Redis and RabbitMQ containers in the README of every service:** no change in `infra`, but the broker would not have the users and the permissions of compose, and the versions of the images would be written in two places.
- **Call through an internal listener of the gateway:** Envoy would balance the load between several engine instances, but the gateway at the edge would also carry internal traffic. That adds a hop and mixes the external and the internal traffic in one component, while a single engine instance needs no load balancing.

## Consequences

- No new repo is needed.
- Because of at-least-once delivery every consumer has to be idempotent, including later ones.
- Extension: a new event comes with a new `type` and routing key. An incompatible change of a schema gets a new version in the type name.
- Several engine instances need a load balancer of their own in front of them under the same service name, which is the server-side discovery pattern. The game-service does not change for that.
- The ports 5672, 6379, 8000 and 15672 have to be free on the machine of a developer, and for a service on the host its own port too.
- A service that runs on the host while its container runs too has two instances, and two consumers would share the queue of the platform-service. So either the override file of the service removes its container, or only the containers that the service needs are started.
- On Docker Desktop the gateway reaches a service on the host that listens only on `127.0.0.1`, and the connections arrive from `127.0.0.1`. On Linux a firewall such as ufw may block the Docker networks from the port of the service.
- A new service that uses a data store joins its network in compose, and a new user of Redis gets an ACL user of its own.
- To do: the RabbitMQ users of the services with their permissions and the remaining settings above go into the compose of `infra`, the outbox, the sender and the engine call with its timeout and retry into the game-service, and the consumer and the storage of the games into the platform-service.

## Open questions

- How the RabbitMQ users get their passwords from `.env`, for example with a definitions file that RabbitMQ imports at boot. A new node that imports definitions creates no default user, so such a file has to contain the admin user too.

## Sources

- RabbitMQ Reliability Guide: https://www.rabbitmq.com/docs/reliability
- RabbitMQ Consumer Acknowledgements and Publisher Confirms: https://www.rabbitmq.com/docs/confirms
- RabbitMQ publishers, unroutable messages: https://www.rabbitmq.com/docs/publishers#unroutable
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/quorum-queues
- RabbitMQ access control: https://www.rabbitmq.com/docs/access-control
- RabbitMQ URI specification: https://www.rabbitmq.com/docs/uri-spec
- RabbitMQ 4.4 release: https://www.rabbitmq.com/blog/2026/10/20/rabbitmq-4.4-release
- Transactional outbox pattern: https://microservices.io/patterns/data/transactional-outbox
- Redis persistence with AOF: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Redis ACL: https://redis.io/docs/latest/operate/oss_and_stack/management/security/acl/
- Official Redis image, protected mode: https://hub.docker.com/_/redis
- Redis licenses: https://redis.io/legal/licenses/
- AsyncAPI 3.0: https://www.asyncapi.com/docs/reference/specification/v3.0.0
- Networking in Compose: https://docs.docker.com/compose/how-tos/networking/
- Port publishing and mapping: https://docs.docker.com/engine/network/port-publishing/
- Use Compose Watch: https://docs.docker.com/compose/how-tos/file-watch/
- Compose file reference, services with `extra_hosts`, `scale` and `depends_on`: https://docs.docker.com/reference/compose-file/services/
- The Twelve-Factor App, VII. Port binding: https://12factor.net/port-binding
- The Twelve-Factor App, X. Dev/prod parity: https://12factor.net/dev-prod-parity
- Pattern: Server-side service discovery: https://microservices.io/patterns/server-side-discovery
- Why API Gateways Aren't Good for East-West Traffic: https://nordicapis.com/why-api-gateways-arent-good-for-east-west-traffic/
