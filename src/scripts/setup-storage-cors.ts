import { parseArgs } from "node:util";
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv } from "@/shared/config/env";

// CORS rule of the private bucket for the direct uploads and downloads of clinical files (ADR-031).
// Run once per environment, with that environment's variables (APP_URL, S3_*), after creating the
// bucket; in production the bucket is on Cloudflare R2, which accepts this S3 call:
//   npm run setup:storage-cors
// Optional: --origin https://app.exemplo.com.br (defaults to APP_URL), --dry-run to only print it.
// Local development does not need it: docker-compose starts SeaweedFS with -s3.allowedOrigins.
const USAGE = "Uso: npm run setup:storage-cors -- [--origin https://app.exemplo.com.br] [--dry-run]";

// PUT uploads the file with its Content-Type, GET and HEAD read thumbnails and downloads. Nothing
// else is allowed, and only from the application's own origin.
export function corsRules(origin: string) {
  return [
    {
      AllowedOrigins: [origin],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["Content-Type"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ];
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { origin: { type: "string" }, "dry-run": { type: "boolean" } } });
  const env = getEnv();
  const origin = new URL(values.origin ?? env.APP_URL).origin;
  const rules = corsRules(origin);
  console.log(JSON.stringify({ bucket: env.S3_BUCKET, CORSRules: rules }, null, 2));
  if (values["dry-run"]) return 0;
  if (!/^https?:\/\//.test(origin)) {
    console.error(USAGE);
    return 1;
  }
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  });
  await client.send(
    new PutBucketCorsCommand({ Bucket: env.S3_BUCKET, CORSConfiguration: { CORSRules: rules } }),
  );
  // Reads it back, so a provider that silently ignores the call is noticed.
  const applied = await client.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }));
  console.log(`CORS aplicado: ${applied.CORSRules?.length ?? 0} regra(s) em ${env.S3_BUCKET}.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
