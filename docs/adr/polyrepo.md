# ADR-2: Polyrepo with one repo per deployment unit

**Related:** NF-9, [ADR-1](microservices.md), [ADR-3](api-gateway.md), [ADR-6](service-communication.md)

## Context

A team of four builds four deployment units with a common deployment. The contracts between the services, the runnable images and the documentation of the system also need a common place that everyone knows.

## Decision

The GitHub organization `szoftarch-chess-platform` has five repos:

| Repo | Content |
|---|---|
| `frontend` | React SPA |
| `game-service` | NestJS game service |
| `engine-service` | Python AI service |
| `platform-service` | ASP.NET Core platform service |
| `infra` | deployment with docker compose, gateway configuration, scripts, the contracts between the services and the system documentation |

- **Contracts:** the contracts between the services are in the `contracts/` folder of the `infra` repo. OpenAPI describes the REST interfaces, and AsyncAPI describes the WebSocket events and the messages of the broker.
- **Images:** every service builds its container image in the CI of its own repo and pushes it to the GitHub Container Registry as `ghcr.io/szoftarch-chess-platform/<repo>`. An image is published only for a git tag of the form `v1.0.0`, and its tag is the version number. On pull requests the CI only builds and tests.
- **Compose:** the base compose file of `infra` refers to these images and takes the tag from an environment variable. For local development an override file named `compose.dev.yaml` builds the selected services from the repos cloned into sibling folders.

## Rationale

- The services can be developed, built and deployed independently, each language with its own tooling, and the areas of responsibility of the team members are clear.
- The contracts are in one place and versioned, so the services written in three languages work from the same source. OpenAPI and AsyncAPI are the two widespread machine-readable standards for request-response and message-based interfaces.
- The CI builds the image of a version once, and compose runs the same version everywhere. This is the separation of the build, release and run stages of the twelve-factor app. The running system does not depend on which branches and local changes someone keeps in their clones.
- With the override file development stays fast. Whoever works on a service builds only that one locally and pulls the others as the images of the last version.
- Decisions that affect one application belong in its repo, and larger-scale decisions can go into a central repo. In version control the documentation changes through the same pull requests as the code that it describes, and Claude Code can import it into every repo.

## Rejected alternatives

- **Contract in the repo of the provider:** the consumer would have to look for it in the repo of the other service.
- **Separate repo for the contracts:** for a team of four a sixth repo is only administration, and `infra` is the common point anyway.
- **Compose that always builds from the local clones:** simpler, but every service has to be built on every machine.
- **Image for every push to `dev` and `main`:** the registry fills up with images that nobody runs, because during development the override file builds the services from the local clones.
- **Documentation outside the repos:** it is not versioned together with the code that it describes.

## Consequences

- Changes that affect several repos, such as the WebSocket protocol, have to be coordinated. A change of a contract is a pull request in the `infra` repo, so the owners of the services that use the interface see it too.
- Every service repo needs a CI workflow and a Dockerfile, because both the CI and the override file build the service as an image.
- A new GHCR package can be private after its first publication. In that case it has to be made public once in the settings of the package, so that the team can pull it without signing in.
- The repos have to be cloned into sibling folders, because the override file and the imports of the CLAUDE.md files refer to the sibling repos.

## Sources

- The Twelve-Factor App, V. Build, release, run: https://www.12factor.net/build-release-run
- Merging Compose files: https://docs.docker.com/compose/how-tos/multiple-compose-files/merge/
- GitHub Container Registry: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- OpenAPI Specification: https://spec.openapis.org/oas/latest.html
- AsyncAPI 3.0: https://www.asyncapi.com/docs/reference/specification/v3.0.0
- The GDS Way, Documenting architecture decisions: https://gds-way.digital.cabinet-office.gov.uk/standards/architecture-decisions.html
- Google Cloud, Architecture decision records overview: https://docs.cloud.google.com/architecture/architecture-decision-records
- Claude Code, importing files into CLAUDE.md: https://code.claude.com/docs/en/memory
