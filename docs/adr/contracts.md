# ADR-7: Design-first contracts

**Related:** NF-8, [ADR-1](microservices.md), [ADR-2](polyrepo.md), [ADR-3](api-gateway.md), [ADR-6](service-communication.md), [ADR-8](contract-conventions.md)

## Context

ADR-2 puts the contracts between the services into the `contracts/` folder of the `infra` repo. It does not say when a contract is written, in which versions of OpenAPI and AsyncAPI, how a contract is checked and how it may change. The four services are built in parallel by different people, so a consumer cannot wait until its provider is ready.

## Decision

- **Design first:** a contract is written and merged in `infra` before the code that implements or calls it. A change of an interface starts with a pull request to its contract, and the implementations follow it. The platform-service still generates its own OpenAPI document for trying out the API in Development, but the contract in `infra` is the one that counts.
- **Files:** every interface has one file, named after the provider and the format, such as `platform-service.openapi.yaml`. The broker messages are in `game-events.asyncapi.yaml`, and the schemas that several files use are in `shared-schemas.yaml`. The index of the system documentation lists the files with their providers and consumers.
- **Formats:** OpenAPI 3.1 for the HTTP APIs and AsyncAPI 3.1 for the Socket.IO events and the broker messages. The schemas use only the keywords that JSON Schema Draft 07 and 2020-12 have in common, so both formats can refer to the shared file.
- **Socket.IO in AsyncAPI:** the document describes the game-service. Its server is the Socket.IO path, its channel is the default namespace, and every event is a message whose name is the name of the event. An event of the client is a `receive` operation, an event of the server is a `send` operation, and the acknowledgement of an event is the `reply` of its operation.
- **Checking:** Redocly CLI lints every contract with its recommended rules and a few exceptions in `contracts/redocly.yaml`. It runs through `npx` with a pinned version, locally and in the CI of `infra` for every pull request that changes the contracts.
- **Version of a contract:** `info.version` follows semantic versioning. A compatible change raises the minor version, and any other change raises the major version. Adding an optional field, an event, an endpoint or a value of an enum is compatible. An incompatible change of a broker message gets a new type as ADR-6 decides, and an incompatible change of another interface is released by its provider and its consumer together.
- **Readers:** a reader ignores the fields that it does not know, and it handles an unknown value of an enum without failing.
- **Examples:** every request, response and message has an example in its contract.
- **Working without the provider:** every consumer replaces its provider with a fake in its own repo, built from the examples of the contract. `infra` runs no mock server. A test event goes to the broker with `rabbitmqadmin` in the RabbitMQ container, with an example of the contract as its payload.
- **Conformance:** the owners of the provider and of the consumer check in review that the code follows the contract. There are no automated contract tests.
- **Generated code:** every repo decides on its own whether it generates types or clients from the contracts.

## Rationale

- With the contract first, the consumer can start at once, and the interface is reviewed before anyone writes code against it. Code first would work only for the platform-service, because nothing generates an AsyncAPI document from the game-service.
- ASP.NET Core 10 generates OpenAPI 3.1 by default and supports 3.2 only from .NET 11, so the generated document of the platform-service can be compared with the contract directly. OpenAPI 3.1 is aligned with JSON Schema 2020-12.
- AsyncAPI 3.1.0 of January 2026 is a minor release without breaking changes, and Redocly CLI lints it. The `reply` of AsyncAPI 3 describes a request with its answer.
- There is no Socket.IO binding in AsyncAPI, and the WebSocket binding only describes the handshake. The blog of AsyncAPI on Socket.IO proposes an `x-ack` extension for the acknowledgements, but it is not part of the specification, while `reply` is.
- Redocly CLI lints OpenAPI 3.2, 3.1 and 3.0 and AsyncAPI 3.x and 2.6, so one tool covers every contract. It is under the MIT license and actively developed, with version 2.82.0 on 19 November 2026.
- Every developer has Node.js for the scripts of `infra` (ADR-2), and Redocly CLI needs Node.js 22.12 or newer. `npx` runs a pinned version without adding a package to the repo, and the same command works in PowerShell, in Git Bash and in the CI.
- Semantic versioning and readers that tolerate what they do not know let the extra features of ADR-1 extend the interfaces with few changes.
- A fake in the repo of the consumer needs no shared component, and the consumer can build the situations that its tests need. The examples keep the fake close to the contract.
- The official management image of RabbitMQ already contains `rabbitmqadmin` v2, so a test event needs no new tool, and a person or Claude can send it with one command.
- Every interface has exactly one provider and one consumer, so review by the two owners is enough for a team of four.

## Rejected alternatives

- **Code first, with the generated OpenAPI document of the platform-service as the contract:** the frontend would wait for the platform-service, and it covers neither Socket.IO nor the broker.
- **OpenAPI 3.2:** .NET 10 cannot generate it, Prism lists only 3.1 and older versions, and Redocly CLI added it as basic support in October 2025.
- **AsyncAPI CLI for the AsyncAPI files:** it is a second tool next to the linter of the OpenAPI files, and its documentation names no published Docker image.
- **The Docker image of Redocly CLI:** it needs no Node.js, but in Git Bash the path of the mounted folder has to be protected from conversion.
- **`x-ack` extension for the acknowledgements:** the tools do not know it.
- **Shared mock server in compose, such as Prism:** Prism is maintained and supports OpenAPI 3.1, but it covers only the REST API, and its static examples cannot follow a flow such as sign-in and refresh.
- **Automated contract tests, such as consumer-driven contracts:** the team checks conformance in review.

## Consequences

- A consumer starts on an interface only after its contract is merged.
- Redocly CLI does not check the examples of AsyncAPI documents against their schemas, so the review has to check them.
- A change of a shared schema affects several contracts, so its pull request needs the review of every owner concerned.
- To do: the CI workflow of `infra` that lints the contracts.

## Sources

- AsyncAPI 3.1.0 release notes: https://www.asyncapi.com/blog/release-notes-3.1.0
- AsyncAPI 3.1.0 specification: https://www.asyncapi.com/docs/reference/specification/v3.1.0
- AsyncAPI bindings: https://github.com/asyncapi/bindings
- Documenting Socket.IO APIs with AsyncAPI: https://www.asyncapi.com/blog/socketio-part2
- OpenAPI Specification versions: https://spec.openapis.org/oas/
- OpenAPI documents in ASP.NET Core: https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi?view=aspnetcore-10.0
- Redocly CLI: https://github.com/Redocly/redocly-cli
- Redocly CLI changelog: https://redocly.com/docs/cli/changelog
- AsyncAPI CLI: https://github.com/asyncapi/cli
- Prism: https://github.com/stoplightio/prism
- rabbitmqadmin v2: https://github.com/rabbitmq/rabbitmqadmin-ng
- Docker images of RabbitMQ: https://github.com/docker-library/rabbitmq
- Semantic Versioning: https://semver.org/
- Tolerant Reader: https://martinfowler.com/bliki/TolerantReader.html
