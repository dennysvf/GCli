-- Local development roles (spec F01, section 6). Production roles are created by the operator.
-- gcli_owner owns the schema and runs migrations; gcli_app is the runtime role.
CREATE ROLE gcli_owner LOGIN PASSWORD 'gcli_owner';
CREATE ROLE gcli_app LOGIN PASSWORD 'gcli_app';

ALTER DATABASE gcli OWNER TO gcli_owner;
GRANT ALL ON SCHEMA public TO gcli_owner;
ALTER SCHEMA public OWNER TO gcli_owner;
GRANT USAGE ON SCHEMA public TO gcli_app;
GRANT CONNECT ON DATABASE gcli TO gcli_app;

-- Prisma Migrate needs a shadow database in development.
ALTER ROLE gcli_owner CREATEDB;
