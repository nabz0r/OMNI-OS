FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/desktop/package.json apps/desktop/package.json
COPY services/collector/package.json services/collector/package.json
RUN npm ci --omit=dev --workspace @omni/collector --ignore-scripts --no-audit --no-fund
COPY services/collector/src services/collector/src
USER node
ENV NODE_ENV=production OMNI_COLLECTOR_HOST=0.0.0.0 OMNI_COLLECTOR_PORT=3008
EXPOSE 3008
CMD ["node", "services/collector/src/server.mjs"]
