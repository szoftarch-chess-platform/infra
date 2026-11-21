# ADR-5: PostgreSQL for long-term storage

**Related:** F-1, F-6, NF-1, NF-3, NF-6, NF-9, X-2, X-4, X-6, [ADR-1](microservices.md), [ADR-2](polyrepo.md), [ADR-3](api-gateway.md), [ADR-6](service-communication.md), PS-ADR-7

## Context

The database server for the long-term data had not been chosen. The data to store is:

- the user accounts and the password hashes,
- the finished games with their move history,
- the data of the extra features if they are built, such as friendships and Élő ratings.

The specified load is small for any of the examined servers, so the decision did not depend on performance.

## Decision

PostgreSQL 18 from the official `postgres:18-alpine` image, with one server instance in the docker compose of the `infra` repo.

- **One database per service:** every service that uses SQL gets its own database and its own database user, and it can access only its own. Currently only the platform-service has one. A script of the postgres container creates the database and the user when the data directory is initialized, and the password of the user comes from an environment variable. Only the services with a database share the network of the server, as ADR-6 decides.
- **Schema:** every service manages the schema and the migrations of its own database.
- **Migrations:** the image of the service contains its migrations, and compose runs them in a one-shot container of the same image before the service starts.
- **Local development:** only the local development override file publishes the port of the database, on `127.0.0.1:5432`. A service under development runs on the host against it with its own database user, as ADR-6 describes for the other ports, and database tools connect to it the same way.

## Rationale

- It is free and open source under the PostgreSQL License.
- The official image runs on amd64 and arm64, so it starts the same way on an x86 machine, on an Apple Silicon Mac and on an ARM server.
- Mature EF Core support. The releases of the Npgsql provider follow the major versions of EF Core, so 10.0.x belongs to EF Core 10. ASP.NET Core Identity works with it, and the built-in `xmin` column can be used for optimistic concurrency.
- It needs few resources, which matters for local runs, because the gateway, Redis and the four application components run next to it.
- Useful built-in features are the JSONB columns, for example for the move list, the trigram index of `pg_trgm` for user name search regardless of case, and replication and partitioning for later scaling.
- 18 is the latest stable major version, and it gets fixes until 14 November 2030. The stable release of 19 is expected on 19 November 2026, and the first release of a new major version is too fresh to build on.
- It is widely used. In the Stack Overflow survey of 2025 it is the most used database with 55.6%, so there is plenty of documentation and examples.
- One database for each service is the database per service pattern of microservices, which keeps the data of a service private to it.
- Microsoft advises to apply EF Core migrations as a step of the deployment rather than from the entry point of every replica. In a one-shot container they run once even with several instances of the service, and the service itself still starts when the database is down.
- With the published port a service on the host uses the same server, database and user as in compose, and a graphical tool shows the schema and the data more easily than `psql`. On `127.0.0.1` only the same machine reaches the port.

## Rejected alternatives

- **Microsoft SQL Server 2025:** it has a first-party EF Core provider, but it is not open source. The Developer edition is licensed only for development and testing, and the free Express edition is limited to a 50 GB database, a 1410 MB buffer pool and 4 cores. The container is supported only on x86-64 and not under emulation such as Rosetta or QEMU, and it needs at least 2 GB of RAM.
- **MySQL, MariaDB:** even the latest release of the most widespread EF Core provider, Pomelo, supports only EF Core 9. The official MySQL provider of Oracle already supports EF Core 10, but far fewer people use it.
- **CockroachDB, YugabyteDB:** distributed SQL with horizontal scaling, which the specified load does not justify, and they are harder to operate. CockroachDB has not been open source since November 2024.
- **SQLite:** it is not a server and allows only one writer at a time, so several platform-service instances cannot share it.
- **MongoDB:** a finished game could be stored well as a document too, but the long-term data goes into an SQL database, ASP.NET Core Identity uses a relational model, and the license of the server, SSPL, is not open source according to the OSI. The move list can be stored in a JSON column in SQL as well.
- **Access only through `docker compose exec` with `psql`:** no port is published, but neither a service on the host nor a database tool can connect.
- **Own PostgreSQL container in the README of the service:** no change in `infra`, but the database would not have the user of compose, the version of the image would be written in two places, and its port would collide with the one of compose.

## Consequences

- Only one server instance has to be operated, but it is a common point of failure for every service that uses SQL.
- There are no SQL queries across services. Such needs have to be served through APIs or events.
- The location of the data directory changed in the 18 image. The volume has to be mounted at `/var/lib/postgresql` and not at the former `/var/lib/postgresql/data`, otherwise the data does not go into the mounted volume.
- The port 5432 has to be free on the machine of a developer, so a PostgreSQL installed on the host has to be stopped or moved to another port.
- Every service with a database has a one-shot migration container in compose, and the service waits until it has finished successfully.
- The script that creates the databases runs only on an empty data directory. When a service gets a database later, its database and user have to be created by hand on the installations that already exist.

## Sources

- PostgreSQL versioning policy: https://www.postgresql.org/support/versioning/
- PostgreSQL 19 RC 1 and the planned stable release: https://www.postgresql.org/about/news/postgresql-19-rc-1-released-3409/
- Official postgres Docker image: https://hub.docker.com/_/postgres
- Npgsql EF Core provider: https://www.nuget.org/packages/Npgsql.EntityFrameworkCore.PostgreSQL
- Npgsql optimistic concurrency with `xmin`: https://www.npgsql.org/efcore/modeling/concurrency.html
- `pg_trgm`: https://www.postgresql.org/docs/current/pgtrgm.html
- Stack Overflow Developer Survey 2025, databases: https://survey.stackoverflow.co/2025/technology
- Database per service pattern: https://microservices.io/patterns/data/database-per-service
- Applying EF Core migrations: https://learn.microsoft.com/ef/core/managing-schemas/migrations/applying
- SQL Server 2025 editions and limits: https://learn.microsoft.com/sql/sql-server/editions-and-components-of-sql-server-2025
- SQL Server container prerequisites: https://learn.microsoft.com/en-us/sql/linux/quickstart-install-connect-docker
- Releases of the Pomelo provider: https://github.com/PomeloFoundation/Pomelo.EntityFrameworkCore.MySql/releases
- Oracle MySQL EF Core provider: https://www.nuget.org/packages/MySql.EntityFrameworkCore
- CockroachDB license change: https://www.cockroachlabs.com/enterprise-license-update/
- OSI on the SSPL: https://opensource.org/blog/the-sspl-is-not-an-open-source-license
