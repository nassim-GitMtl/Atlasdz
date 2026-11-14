# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
FROM ${NODE_IMAGE} AS workspace
WORKDIR /workspace
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
COPY tools/deployment ./tools/deployment

FROM workspace AS api-build
RUN pnpm --filter @atlas/api... build
# Isolated packaging tool: 11.19 legacy deploy leaves nonportable workspace links.
RUN npm install --global pnpm@11.25.0 && npm pkg set packageManager=pnpm@11.25.0
RUN node -e "require('node:assert/strict').equal(require('node:child_process').execFileSync('pnpm', ['--version'], {encoding:'utf8'}).trim(), '11.25.0')"
RUN pnpm --filter @atlas/api deploy --prod --legacy /out/api
RUN pnpm --filter @atlas/database deploy --prod --legacy /out/migrate
# Legacy deploy's hoisted self-links still refer to the build workspace.
RUN if [ -L /out/api/node_modules/.pnpm/node_modules/@atlas/api ]; then \
      ln -sfn ../../../.. /out/api/node_modules/.pnpm/node_modules/@atlas/api; fi \
 && if [ -L /out/migrate/node_modules/.pnpm/node_modules/@atlas/database ]; then \
      ln -sfn ../../../.. /out/migrate/node_modules/.pnpm/node_modules/@atlas/database; fi

FROM workspace AS customer-build
RUN pnpm --filter @atlas/contracts build && pnpm --filter @atlas/customer-web build

FROM workspace AS seller-build
RUN pnpm --filter @atlas/contracts build && pnpm --filter @atlas/seller-center build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOST=0.0.0.0 PORT=3000
COPY --chown=node:node tools/deployment/start-release.mjs tools/deployment/release-env.mjs tools/deployment/healthcheck.mjs ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 CMD ["node", "healthcheck.mjs"]

FROM runtime AS api
COPY --from=api-build --chown=node:node /out/api/ ./
# Photo volume mount point; a fresh named volume inherits this ownership.
USER root
RUN mkdir -p /data/media && chown node:node /data/media
USER node
CMD ["node", "start-release.mjs", "api"]

FROM runtime AS migrate
COPY --from=api-build --chown=node:node /out/migrate/ ./
COPY --chown=node:node database/migrations/ ./migrations/
HEALTHCHECK NONE
CMD ["node", "start-release.mjs", "migrate"]

FROM runtime AS customer-web
COPY --from=customer-build --chown=node:node /workspace/apps/customer-web/.next/standalone/ ./
CMD ["node", "start-release.mjs", "customer-web"]

FROM runtime AS seller-center
COPY --from=seller-build --chown=node:node /workspace/apps/seller-center/.next/standalone/ ./
CMD ["node", "start-release.mjs", "seller-center"]
