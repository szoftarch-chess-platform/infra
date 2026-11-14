# ADR-6: Communication between the services

**Related:** F-2, F-6, NF-3, NF-6, NF-8, NF-9, X-3, X-4, X-6, [ADR-1](microservices.md), [ADR-2](polyrepo.md), [ADR-3](api-gateway.md), [ADR-4](authentication.md), [ADR-5](database.md)

## Context

The services call each other in two places, and the two calls are different in nature:

- In a game against the AI the game-service asks the engine-service for the computer move. This is request-response, because the game cannot go on without the answer.
- The game-service hands the finished game over to the platform-service, which stores it permanently. This has to happen even if the platform-service is not running at that moment. Later extensions, such as the Élő rating or challenging friends, would build on the same or similar events.

An internal call must not reach the services that trust the identity headers of the gateway.

## Decision

The two calls get two integration styles.

- **Move request with synchronous HTTP:** the game-service calls the engine-service directly by its service name in compose, with REST/JSON. The position goes in FEN, the move comes back in UCI notation, and the request also contains the game variant, which is `standard` by default. The game-service applies a timeout and repeats a failed request once. The engine-service reads no identity headers, and it is on an internal Docker network that it shares only with the game-service. The first version runs one engine instance.
- **Handover of the game with asynchronous messaging over RabbitMQ:** the game-service publishes the finished game as an event to a durable topic exchange named `game.events` with the routing key `game.finished`. The event carries the result of the game and its full move list. The platform-service consumes it from its own durable quorum queue named `platform.game-finished`, and it acknowledges only after the database transaction has been committed.
- **Reliable sending with a transactional outbox:** the game-service writes the event to an outbox list in the same Redis transaction in which it closes the game, and it sends the event on from there with publisher confirms. If the broker cannot be reached, the event waits in the outbox. Redis has AOF persistence turned on, so the games in progress and the outbox survive a restart too.
- **Idempotent consumption:** the platform-service filters out repeated deliveries by the id of the event, and a message that cannot be processed goes to a dead-letter queue after the delivery limit.
- **Message format:** JSON with a common envelope of `id` as a UUID, `type` with a version such as `game.finished.v1`, `source`, `time` and `data`. The schemas are written in AsyncAPI among the contracts of `infra`.
- **Topology:** every service declares what it owns at startup. The sender declares the exchange, and the consumer declares its own queue and binding. The declarations are idempotent.
- **Operation:** RabbitMQ runs as one instance in the compose of `infra`, and every service connects with its own user. Only the local development override file publishes the web management interface, and only on `127.0.0.1`.

## Rationale

- The move request is a remote procedure call, while the handover of the game is messaging, which is loosely coupled, and the broker guarantees the delivery.
- The move request is request-response, so synchronous HTTP is the natural choice. In compose the service name is the service discovery, so the call needs no extra component. Repeating the request is safe, because the same position can be asked again at any time.
- The handover of the game needs a message queue, not a stream. Every finished game has to be processed once by each consumer, and the durable store of the games is the database of the platform-service, so the broker does not have to keep a replayable event log. If one is needed later, RabbitMQ also offers streams in the same broker.
- RabbitMQ is the best known open-source message broker under MPL 2.0, and the quorum queue is its recommended queue type when data safety matters. Publisher confirms and consumer acknowledgements together give at-least-once delivery. A new consumer can be bound to the topic exchange without changing the sender, and the web management interface shows the path of the messages.
- The platform-service does not have to open an internal HTTP endpoint, so it does not have to authenticate a caller that does not come through the gateway.
- The outbox and the idempotent consumer cover the two ends of at-least-once delivery. The event is not lost, and a repeated delivery does not create a duplicate game.
- Thanks to the game variant field, a new game mode can be introduced without changing the interfaces of the move request and of the events.

## Rejected alternatives

- **Synchronous REST call to the platform-service at the end of the game:** if the platform-service is not running, the game is not saved, or the game-service has to retry.
- **Redis Streams:** no new component is needed, but the platform-service would connect to the own Redis store of the game-service, and redelivery, dead-letter handling and monitoring would have to be written by hand.
- **Apache Kafka:** a replayable event log with high throughput, which is not needed here, and it is much harder to operate.
- **NATS JetStream:** light and durable, but it has no built-in graphical management interface.
- **Call through an internal listener of the gateway:** Envoy would balance the load between several engine instances, but the gateway at the edge would also carry internal traffic. That adds a hop and mixes the external and the internal traffic in one component, while a single engine instance needs no load balancing.

## Consequences

- No new repo is needed.
- Because of at-least-once delivery every consumer has to be idempotent, including later ones.
- Extension: a new event comes with a new `type` and routing key. An incompatible change of a schema gets a new version in the type name.
- Several engine instances need a load balancer of their own in front of them under the same service name, which is the server-side discovery pattern. The game-service does not change for that.
- To do: RabbitMQ, the internal network of the engine-service and its OpenAPI contract go into the `infra` repo, the outbox, the sender and the engine call with its timeout and retry into the game-service, and the consumer and the storage of the games into the platform-service.

## Sources

- RabbitMQ Reliability Guide: https://www.rabbitmq.com/docs/reliability
- RabbitMQ Consumer Acknowledgements and Publisher Confirms: https://www.rabbitmq.com/docs/confirms
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/quorum-queues
- RabbitMQ 4.4 release: https://www.rabbitmq.com/blog/2026/10/20/rabbitmq-4.4-release
- Transactional outbox pattern: https://microservices.io/patterns/data/transactional-outbox
- Redis persistence with AOF: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- AsyncAPI 3.0: https://www.asyncapi.com/docs/reference/specification/v3.0.0
- Networking in Compose: https://docs.docker.com/compose/how-tos/networking/
- Pattern: Server-side service discovery: https://microservices.io/patterns/server-side-discovery
- Why API Gateways Aren't Good for East-West Traffic: https://nordicapis.com/why-api-gateways-arent-good-for-east-west-traffic/
