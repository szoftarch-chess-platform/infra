-- Runs once, when the postgres container initializes an empty data directory.
-- It creates the database and the user of the platform-service.

\getenv platform_password PLATFORM_DB_PASSWORD

CREATE ROLE platform LOGIN PASSWORD :'platform_password';
CREATE DATABASE platform OWNER platform;

-- By default every user may connect to a new database.
REVOKE ALL ON DATABASE platform FROM PUBLIC;
