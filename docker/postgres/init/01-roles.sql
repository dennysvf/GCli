-- Local development roles (spec F01, section 6). Production roles are created by the operator
-- with the same statements before the first `prisma migrate deploy`.
-- gcli_owner owns the schema and runs migrations; gcli_app is the runtime role.
CREATE ROLE gcli_owner LOGIN PASSWORD 'gcli_owner';
CREATE ROLE gcli_app LOGIN PASSWORD 'gcli_app';

-- The owner may create objects owned by the runtime role (the pg-boss schema).
GRANT gcli_app TO gcli_owner;

ALTER DATABASE gcli OWNER TO gcli_owner;
ALTER SCHEMA public OWNER TO gcli_owner;
GRANT USAGE ON SCHEMA public TO gcli_app;
GRANT CONNECT ON DATABASE gcli TO gcli_app;

-- Prisma Migrate needs a shadow database in development; E2E tests use their own database.
ALTER ROLE gcli_owner CREATEDB;
CREATE DATABASE gcli_e2e OWNER gcli_owner;
\connect gcli_e2e
ALTER SCHEMA public OWNER TO gcli_owner;
GRANT USAGE ON SCHEMA public TO gcli_app;
