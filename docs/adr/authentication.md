# ADR-4: Authentication with JWT validation in the gateway

**Related:** F-1, NF-1, X-7, [ADR-3](api-gateway.md), [ADR-5](database.md)

## Context

Both the REST requests and the WebSocket connections have to be authenticated, but the WebSocket API of the browser cannot send an `Authorization` header. Some routes, such as registration and spectating, have to work without signing in. The services learn who the user is from the headers that the gateway forwards, and all of them have to refer to the user with the same id.

## Decision

- **Issuing:** the platform-service signs the users in and issues the tokens on registration, login and refresh. It signs them with ES256, which is ECDSA on the P-256 curve. It gets the private key as a PEM file in PKCS #8 format, and the gateway reads the public key from a local JWKS file. The `kid` in the header of the token identifies the key in the JWKS, and it is the JWK thumbprint of the public key. A script in `infra` creates the development key pair and its JWKS outside version control.
- **Content:** `iss` = `platform-service`, `aud` = `chess-platform`, `sub` = the user id, `preferred_username` = the user name, plus `iat` and `exp`.
- **Lifetime and refresh:** the access token is valid for 15 minutes. It comes with a random, opaque refresh token, which is valid for 7 days, and the platform-service stores only its hash. Every refresh with `POST /api/auth/refresh` gives a new refresh token and invalidates the old one, which is called rotation. If a refresh token that was already replaced arrives again, the platform-service revokes the tokens of the whole session.
- **Logout:** `POST /api/auth/logout` revokes the refresh tokens of the session and deletes both cookies. The access token stays valid until it expires.
- **Transport:** the access token travels in the `__Host-access-token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/`), so the WebSocket handshake carries it too. The refresh token is in the `__Secure-refresh-token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/api/auth`), so it only reaches the auth endpoints. For tests the `Authorization: Bearer` header is accepted too.
- **Validation:** the `jwt_authn` filter of Envoy checks the signature, the issuer, the audience and the expiry. Then the `claim_to_headers` setting puts the `sub` claim into the `x-user-id` header and the `preferred_username` claim into the `x-user-name` header.
- **User id:** a UUID v7, which the platform-service assigns at registration, and every service refers to the user with it.
- **User name:** 3 to 20 characters from the letters of the English alphabet, digits, underscore and hyphen (`^[A-Za-z0-9_-]{3,20}$`), unique regardless of case.
- **Authorization:** the domain-level decisions, such as whether the user is a player of a given game, stay in the services.
- **Trust:** the services that the clients use can only be reached through the gateway, and of the `x-user-*` headers they read only `x-user-id` and `x-user-name`.
- **WebSocket:** the token travels in the cookie, and with Socket.IO not in the `auth` field either, because otherwise the gateway does not see it.
- **Origin check:** the gateway rejects a WebSocket handshake whose `Origin` header differs from the address that the request was sent to, which is `https://` followed by the `Host` header. A handshake without an `Origin` header passes.

## Rationale

- There is one validation point instead of two languages, C# and TypeScript.
- REST and WebSocket get the same rules, and an invalid request does not even reach the services.
- This is the gateway offloading pattern.
- The gateway checks locally with the public key, so the games in progress do not depend on the platform-service.
- Envoy removes the headers listed in `claim_to_headers` from every request, also on the routes that skip the JWT check, so the client cannot forge them. An `x-user-*` header that is not listed there can still come from the client, so the services trust only the listed ones.
- A UUID v7 starts with a millisecond timestamp, so it is ordered by time and has better locality in a database index than random ids. PostgreSQL 18 also generates it natively with `uuidv7()`.
- A UUID needs no central sequence, and the users cannot be counted through it in URLs.
- The signature and the key of ES256 are much shorter than those of RS256, so the cookie is smaller, and both Envoy and the JWT library of .NET support it.
- With the public key read from a file, the gateway does not depend on the platform-service at startup either. Key rotation is not needed, and if it is needed after all, the JWKS endpoint can be introduced later.
- The JWK thumbprint is a hash of the public key. The platform-service can compute the `kid` from its key file, so it needs no separate setting that could differ from the JWKS.
- The gateway validates locally and does not ask the platform-service, so the access token cannot be revoked. The short lifetime limits how long a stolen token, or one left over after logout, can be used.
- Rotating the refresh token and detecting its reuse is what the OAuth 2.0 security recommendation, RFC 9700, advises for browser-based clients. The platform-service stores the refresh token, so it can be revoked immediately on logout.
- `preferred_username` is the standard OpenID Connect claim for the short user name. There `name` means the full name.
- According to RFC 9110 a new header value should consist only of visible ASCII characters, and the recipient has to treat any other bytes as opaque data. Kestrel rejects them by default, and Node reads them as Latin-1. So an ASCII user name can travel unchanged in the `x-user-name` header, and it also rules out impersonation with look-alike Unicode characters.
- `SameSite=Strict` is the strongest built-in protection against CSRF, and every request of the SPA starts from the same site. The browser accepts a cookie with the `__Host-` prefix only with `Secure`, `Path=/` and without `Domain`, so another host cannot overwrite it.
- The browser sends the cookie with a WebSocket handshake too, and no same-origin rule stops a page from opening a WebSocket to another address. `SameSite=Strict` does not cover every case, because a page on another port of the same host or on a sibling subdomain counts as the same site. The browser sets the `Origin` header of the handshake, and a page cannot change it.
- The check compares the header with the address of the request itself, so it needs no setting that differs between the environments. A client that is not a browser sends no `Origin` header, and it holds no cookie that a foreign page could misuse.
- The check is in the gateway next to the JWT validation, so it covers every WebSocket route, and a foreign handshake does not reach the game-service.

## Rejected alternatives

- **Validation in every service:** duplicated logic in two languages, and the rules can drift apart.
- **ForwardAuth or ext_authz to the platform-service:** every request, including the WebSocket connect, would depend on the availability of the platform-service.
- **bigint identity as the user id:** compact and easy to read, but URLs such as `/users/1` and `/users/2` can be enumerated and reveal the number of users.
- **UUID v4 as the user id:** it is random, so new ids land at random points of the index, and its index locality is worse than that of UUID v7.
- **RS256:** a much longer signature and key, without an advantage.
- **JWKS endpoint in the platform-service:** it is the standard way of key rotation, but Envoy would fetch the key from the platform-service at startup and on every refresh.
- **Long-lived access token without refresh:** simpler, but it would stay usable for hours after logout.
- **Revocation list for the access tokens, for example in Redis:** every request would need an external check in the gateway, which removes the advantage of the local validation.
- **Non-ASCII user name percent-encoded in the claim:** every reader in all three languages would have to decode it, and a forgotten decoding shows a wrong name.
- **Non-ASCII user name as raw UTF-8 in the header:** Kestrel rejects it by default, Node reads it as Latin-1, and even after changing that every component would have to handle it the same way.
- **`Origin` check in the game-service:** the `allowRequest` setting of Socket.IO could do it in a few lines, but it would be a second validation point, and every Socket.IO path would need it.
- **List of allowed origins in the configuration of the gateway:** it would have to be set for every environment, and a wrong value locks the browsers out.

## Consequences

- The `Origin` check is a short Lua script in the configuration of the gateway. A proxy in front of the gateway, such as the dev server of the frontend, has to forward the `Host` header unchanged, otherwise the gateway rejects the handshake.
- The gateway is a critical component. A broken configuration affects every service.
- The list of identity headers is a contract between the gateway and the services. A new header needs the `claim_to_headers` setting of Envoy and the services that read it to be extended at the same time.
- Every service handles the user id as a UUID. The time of the registration can be read from the id.
- After a 401 response or a failed WebSocket connect, the frontend calls `/api/auth/refresh` once and repeats the request. It has to queue parallel refreshes, otherwise the second one would send a refresh token that was already replaced, which would look like reuse.
- The gateway checks a WebSocket connection only when it is opened, so an open connection can outlive the expiry of the access token and the logout. On logout the frontend closes the connection.
- Because of the `Secure` and `__Host-` cookies, local development runs on HTTPS too, including the dev server of the frontend.
- To do: the storage of the refresh tokens and the user name rule go into the platform-service.

## Sources

- Envoy `jwt_authn`, `claim_to_headers`: https://www.envoyproxy.io/docs/envoy/latest/api-v3/extensions/filters/http/jwt_authn/v3/config.proto
- Gateway Offloading pattern: https://learn.microsoft.com/azure/architecture/patterns/gateway-offloading
- RFC 9562, UUID v7: https://www.rfc-editor.org/rfc/rfc9562
- PostgreSQL 18 UUID functions, `uuidv7()`: https://www.postgresql.org/docs/18/functions-uuid.html
- Envoy `jwt_authn`, supported algorithms and local JWKS: https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/jwt_authn_filter
- RFC 7638, JSON Web Key Thumbprint: https://www.rfc-editor.org/rfc/rfc7638
- RFC 9700, OAuth 2.0 Security Best Current Practice: https://www.rfc-editor.org/rfc/rfc9700
- OpenID Connect Core 1.0, Standard Claims: https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
- RFC 9110, Field Values: https://www.rfc-editor.org/rfc/rfc9110#section-5.5
- MDN, Set-Cookie and cookie prefixes: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
- RFC 6455, The WebSocket Protocol, Origin Considerations: https://www.rfc-editor.org/rfc/rfc6455#section-10.2
- MDN, Site: https://developer.mozilla.org/en-US/docs/Glossary/Site
- Envoy Lua filter: https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/lua_filter
