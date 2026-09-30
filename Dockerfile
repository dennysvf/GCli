# syntax=docker/dockerfile:1.7
# One image, three commands (architecture ADR-012):
#   web:     npx next start -p 3000            (default)
#   worker:  npx tsx src/worker/index.ts
#   migrate: npx prisma migrate deploy        (release step, owner role)
#
# Optional build secret "extra_ca": a root certificate for networks or antivirus software that
# intercept HTTPS (for example Norton Web Shield). It is used only while building, never stored:
#   docker build --secret id=extra_ca,src=/path/to/root.pem .

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# --ignore-scripts skips the husky "prepare" hook; the Prisma client is generated explicitly.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
    && npm ci --ignore-scripts --no-audit --no-fund \
    && npx prisma generate

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
    && npm run build \
    && npm prune --omit=dev --ignore-scripts

FROM base AS runner
ENV NODE_ENV=production PORT=3000
COPY --from=build --chown=node:node /app/package.json /app/next.config.ts /app/tsconfig.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/prisma ./prisma
# The worker runs from TypeScript sources (tsx), including the generated Prisma client.
COPY --from=build --chown=node:node /app/src ./src
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
