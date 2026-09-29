import pino from "pino";

// Structured JSON logs without personal data (architecture sections 7 and 9). Known personal
// fields are redacted at any depth; log IDs instead.
const REDACTED_KEYS = ["cpf", "email", "phone", "name", "password", "token", "content", "newPassword"];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: process.env.GCLI_PROCESS ?? "web" },
  redact: {
    paths: REDACTED_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]),
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
