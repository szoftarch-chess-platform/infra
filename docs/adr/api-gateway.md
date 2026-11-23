# ADR-3: Envoy as the API gateway

**Related:** F-6, NF-1, NF-4, NF-5, NF-6, NF-9, X-7, [ADR-1](microservices.md), [ADR-2](polyrepo.md), [ADR-4](authentication.md), [ADR-6](service-communication.md), [ADR-10](live-game.md), PS-ADR-11

## Context

The browser has to reach the SPA, the REST API of the platform-service and the WebSockets of the game-service through a single entry point. The requirements are:

- path-based routing,
- TLS termination for HTTPS and WSS,
- long-lived WebSockets, also with guest spectators,
- load balancing between several game-service instances,
- JWT validation,
- rate limiting on login.

## Decision

Envoy Proxy 1.40 with static YAML configuration in the `infra` repo, run from the official `envoyproxy/envoy:v1.40-latest` image. In the base compose file only the gateway publishes a port to the host. It listens for HTTPS only, and the host port comes from the `GATEWAY_PORT` variable of compose. Locally the system is at `https://localhost:8443`.

| Path | Target | JWT |
|---|---|---|
| `/` | frontend (static SPA) | not needed |
| `/api/auth/*` (register, login, refresh, logout) | platform-service | not needed, rate limit on login |
| `/api/*` | platform-service | required |
| `/ws/game` | game-service | required, from the cookie |
| `/ws/spectate` | game-service | not needed, the game-service checks the token of the link |

The rate limit on login gives every client address a token bucket of its own for `POST /api/auth/login`. A bucket holds 30 tokens and gets one new token every 2 seconds, so an address can try 30 times at once and then once every 2 seconds. The route matches the method and the path regardless of case and the path also with a slash at the end, because the platform-service routes such requests to the login too. The gateway checks the origin of the request first, as ADR-4 decides, so a request that it refuses does not count. A limited request gets 429 from the gateway and does not reach the platform-service.

The game-service gets no REST route. Every operation of a live game, which means joining and leaving the queue, starting a game against the bot, a move, resigning and fetching the state after a reconnect, is a Socket.IO event on `/ws/game`, and the operations that need an answer use acknowledgements. So `/api/*` belongs entirely to the platform-service, including the endpoints of the game history. The two WebSocket routes are two separate Socket.IO paths (`path`) in the game-service, because the gateway decides about the JWT by route, and the namespace of Socket.IO does not show in the URL.

The game-service uses the Redis adapter of Socket.IO, which forwards the events between its instances. So the gateway can balance the connections between several game-service instances without stickiness.

For local runs a script in `infra` creates a development certificate authority and a certificate for `localhost` that the authority signs. OpenSSL runs in a container for this, and the key of the authority is never saved. Every developer adds the authority to the trusted roots of their machine once.

## Rationale

- Native, free JWT filter (`jwt_authn`). It also reads the token from a cookie, it works with a local or a remote JWKS, and where the token is required can be set per route.
- It can put the claims of the token into headers (`claim_to_headers`).
- Built-in fault tolerance with circuit breakers, outlier detection and retry policies.
- Load balancing. The `STRICT_DNS` cluster also finds the instances scaled in compose.
- Local rate limiting with a separate token bucket for each IP.
- NIST SP 800-63B-4 requires controls against online guessing of passwords. It limits the consecutive failed attempts on one account to 100 by disabling the password, which works again only after an account recovery. The system has no account recovery, because the email addresses are not verified (ADR-4), so a disabled password would lock its user out for good, and anyone could do this with wrong passwords. So the platform-service has no limit per account (PS-ADR-11), and the limit per address of the gateway is the only control. This departs from NIST on purpose.
- The size of the bucket is the default of Supabase for the password sign-in of its token endpoint, which also counts every request of an IP address in a token bucket. Supabase allows bursts of 30 and 150 requests in 5 minutes. A person who mistypes a password needs only a few attempts, and several users behind one NAT fit into the bucket too. So do the tests on the machine of a developer, where Docker Desktop shows every client with the same address.
- The gateway counts every attempt, because it does not see whether a sign-in fails.
- A page of another site can make the browsers of its visitors send requests to the gateway, and these come from the addresses of the visitors. The check of the origin refuses such a POST before the limit counts it, and the GET of an image does not count, so the page cannot use up the attempts of the users behind those addresses.
- Detailed observability with statistics, a Prometheus endpoint, access logs and tracing.
- It consists of configuration only, so it needs no repo of its own. It is an active CNCF project.
- With several Socket.IO servers the default in-memory adapter has to be replaced, so that the events reach every client. The Redis adapter does this over Redis Pub/Sub, and Redis is already part of the system.
- The live game runs on a single connection that is already authenticated. A move does not open a new HTTP request, the order of the messages is kept within the connection, and there is no route conflict with the game history endpoints of the platform-service.
- The `v1.40-latest` tag follows the patch releases of one release line. Fixes arrive without a change, and moving to a new release line is a deliberate step.
- Port 8443 does not collide with a web server that already runs on the machine of a developer. It also works with rootless Docker, which cannot publish ports below 1024 by default.
- Once the authority is trusted, the browser accepts the local certificate like a real one. Creating it needs only Docker, which every developer has. The authority cannot sign anything else, because its key does not exist after the script has run.

## Rejected alternatives

- **Traefik:** the JWT middleware is only available in the paid Traefik Hub.
- **NGINX:** the JWT module is only part of the commercial NGINX Plus.
- **Kong:** the OSS line stopped at 3.9.1, and since 3.10 there is no free mode without a license.
- **Tyk:** it uses sessions and policies for JWT, and it does not run without Redis.
- **Apache APISIX:** it has a consumer-based JWT model. A claim of the token has to point to a consumer registered in advance, which is a detour for our own user tokens.
- **YARP:** technically the second best, but it needs our own C# code and a separate project, it has less built-in fault tolerance without retries and circuit breakers, and it has had no release since February 2025. Worth reconsidering if custom gateway logic is needed.
- **Caddy:** JWT only with a community plugin.
- **Ocelot:** according to the 24.0 documentation WebSocket routes have no authentication and authorization, and its own team considers the WebSocket implementation outdated.
- **KrakenD:** WebSocket only in the Enterprise edition.
- **HAProxy:** it has a built-in `jwt_verify`, but no native JWKS support, and the expiry and the claims have to be checked with manual rules.
- **Envoy Gateway:** it is made for Kubernetes, and its standalone mode started as an experimental feature.
- **REST route for the game-service under a separate prefix such as `/api/live/*`:** the same live game would run on two channels.
- **Ring hash on the game id:** the gateway would steer both players of a game to the same instance, but the key is only known after pairing, so the client would have to open a new connection, and the pairing queue would still not be shared between the instances.
- **Port 443 for local runs:** the address would be shorter, but the port can collide with a web server on the machine of a developer, and rootless Docker cannot publish it by default.
- **Listener for plain HTTP that redirects to HTTPS:** every link of the system uses HTTPS, so the redirect would only add configuration.
- **mkcert for the local certificate:** it adds its authority to the trust stores of the system and of the browsers on its own, but every developer would have to install one more tool.
- **Self-signed local certificate without an authority:** the simplest, but the browser does not accept it, so every developer would have to click through a warning.
- **A stricter bucket, such as 10 attempts and then one a minute:** guessing gets slower, but the users behind one NAT and the tests of a developer would wait for minutes.
- **The 100 attempts a day of the suspicious IP throttling of Auth0:** Auth0 counts only the failed sign-ins, while the gateway counts every request, so the same size would also hold back the successful ones.
- **The global rate limit service of Envoy with Redis:** it shares the buckets between several gateways, but the system runs one gateway.

## Consequences

- The configuration is verbose. `envoy --mode validate` shows its errors before startup.
- On the WebSocket routes the route timeout is turned off (`timeout: 0s`), the idle timeout is one hour instead of the default 5 minutes, and the client has to send heartbeats.
- After a configuration change the container has to be restarted.
- The admin interface on port 9901 must not be published.
- The TLS certificate goes to the gateway. Locally the browser warns about it until the developer trusts the development authority. The local certificate is valid for 825 days, and after that the script has to create a new one.
- TLS ends at the gateway. Behind it the containers talk to each other in plain HTTP on the networks of compose, which do not leave the host.
- The configuration contains two short Lua scripts of ADR-4, which check the origin of the WebSocket handshakes and of the requests under `/api` that change something. Everything else in it is declarative.
- Envoy does not serve static files, so the frontend container serves the SPA.
- Everything comes from one origin, so CORS is not needed.
- The Socket.IO client uses only the WebSocket transport, without long polling. A connection stays on the same game-service instance all along, so no sticky sessions are needed. A client in a restrictive network may fail to connect, because there is no fallback to long polling.
- The game-service keeps no state of the games or of the pairing in the memory of its process, so any instance can serve any event.
- The state of a game changes only through atomic Redis operations, because two events of the same game can arrive at two instances at the same time.
- To do: the Redis adapter of Socket.IO goes into the game-service.
- The rate limit holds back the attempts of one address. An attack from many addresses gets 30 attempts a minute from each of them, and the users behind one NAT share one bucket.
- Nothing limits the attempts on one account, so an attack from many addresses can try any number of passwords for one user, which NIST SP 800-63B-4 does not allow.
- Envoy keeps the buckets of at most 10,000 addresses at a time. An address whose bucket was dropped starts with a full one, but a bucket is full again a minute after its last request anyway.

## Sources

- Envoy `jwt_authn`: https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/jwt_authn_filter
- Envoy rate limit descriptors: https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/common/ratelimit/v3/ratelimit.proto
- Envoy local rate limit: https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/local_rate_limit_filter
- NIST SP 800-63B-4, rate limiting: https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#throttle
- Supabase Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- Auth0 suspicious IP throttling: https://auth0.com/docs/secure/attack-protection/suspicious-ip-throttling
- Envoy Docker images: https://www.envoyproxy.io/docs/envoy/latest/start/docker
- Rootless Docker: https://docs.docker.com/engine/security/rootless/
- mkcert: https://github.com/FiloSottile/mkcert
- Traefik JWT middleware: https://doc.traefik.io/reference/routing-configuration/http/middlewares/jwt
- NGINX `auth_jwt`: https://nginx.org/docs/http/ngx_http_auth_jwt_module.html
- The state of Kong OSS, Supabase changelog: https://supabase.com/changelog/48048-self-hosted-supabase-envoy-becomes-the-default-api-gateway-b
- APISIX `jwt-auth`: https://apisix.incubator.apache.org/docs/apisix/3.12/plugins/jwt-auth/
- YARP releases: https://github.com/dotnet/yarp/releases
- Ocelot WebSockets: https://ocelot.readthedocs.io/en/24.0/features/websockets.html
- KrakenD WebSockets: https://www.krakend.io/docs/enterprise/websockets/
- Envoy Gateway standalone mode: https://gateway.envoyproxy.io/v1.2/tasks/operations/standalone-deployment-mode/
- Socket.IO with multiple nodes: https://socket.io/docs/v4/using-multiple-nodes/
- Socket.IO adapters: https://socket.io/docs/v4/adapter/
- Socket.IO rooms with multiple servers: https://socket.io/docs/v4/rooms/
