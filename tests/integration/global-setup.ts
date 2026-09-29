import { execSync } from "node:child_process";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { GenericContainer, type StartedTestContainer, Wait } from "testcontainers";
import type { TestProject } from "vitest/node";

// Integration tests run against real services in containers (architecture ADR-013):
// PostgreSQL 18 with the same roles as production, Mailpit for email, and MinIO for storage.
declare module "vitest" {
  export interface ProvidedContext {
    env: Record<string, string>;
  }
}

let postgres: StartedPostgreSqlContainer | undefined;
let mailpit: StartedTestContainer | undefined;
let minio: StartedTestContainer | undefined;

export default async function setup(project: TestProject) {
  [postgres, mailpit, minio] = await Promise.all([
    new PostgreSqlContainer("postgres:18")
      .withDatabase("gcli")
      .withUsername("postgres")
      .withPassword("postgres")
      .withCopyFilesToContainer([
        { source: "docker/postgres/init/01-roles.sql", target: "/docker-entrypoint-initdb.d/01-roles.sql" },
      ])
      .start(),
    new GenericContainer("axllent/mailpit:latest")
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp("/api/v1/info", 8025))
      .start(),
    new GenericContainer("minio/minio:latest")
      .withCommand(["server", "/data"])
      .withEnvironment({ MINIO_ROOT_USER: "minio", MINIO_ROOT_PASSWORD: "minio12345" })
      .withExposedPorts(9000)
      .withWaitStrategy(Wait.forHttp("/minio/health/ready", 9000))
      .start(),
  ]);

  const host = postgres.getHost();
  const port = postgres.getMappedPort(5432);
  const s3Endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

  const env: Record<string, string> = {
    NODE_ENV: "test",
    DATABASE_URL: `postgresql://gcli_app:gcli_app@${host}:${port}/gcli`,
    DATABASE_MIGRATION_URL: `postgresql://gcli_owner:gcli_owner@${host}:${port}/gcli`,
    APP_URL: "http://localhost:3001",
    BETTER_AUTH_SECRET: "integration-tests-secret-with-more-than-32-chars",
    TRUST_PROXY: "true",
    SMTP_HOST: mailpit.getHost(),
    SMTP_PORT: String(mailpit.getMappedPort(1025)),
    SMTP_SECURE: "false",
    SMTP_FROM: "GCli <no-reply@gcli.test>",
    MAILPIT_API_URL: `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`,
    S3_ENDPOINT: s3Endpoint,
    S3_REGION: "auto",
    S3_BUCKET: "gcli-test",
    S3_ACCESS_KEY_ID: "minio",
    S3_SECRET_ACCESS_KEY: "minio12345",
    S3_FORCE_PATH_STYLE: "true",
    LOG_LEVEL: "silent",
  };

  const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId: "minio", secretAccessKey: "minio12345" },
  });
  await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));

  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, ...env } });

  project.provide("env", env);

  return async () => {
    await Promise.all([postgres?.stop(), mailpit?.stop(), minio?.stop()]);
  };
}
