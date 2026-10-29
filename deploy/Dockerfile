# Build from repository root: docker build -f deploy/Dockerfile -t geotechniek-core .
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY apps/desktop/package*.json apps/desktop/
RUN npm --prefix apps/desktop ci --ignore-scripts
COPY apps/desktop/src apps/desktop/src
COPY packages/core packages/core
COPY scripts/build-core.mjs scripts/build-core.mjs
RUN node scripts/build-core.mjs

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production OGS_HOST=0.0.0.0 PORT=8788
COPY --from=build --chown=node:node /src/packages/core/dist ./dist
USER node
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD ["node","--input-type=module","-e","const r=await fetch('http://127.0.0.1:8788/health');if(!r.ok)process.exit(1)"]
CMD ["node","dist/server.mjs"]
