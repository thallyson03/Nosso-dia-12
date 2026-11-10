FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends wget ca-certificates tzdata \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3008
ENV TZ=America/Sao_Paulo

WORKDIR /app

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

COPY . .

WORKDIR /app/server
EXPOSE 3008

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3008/api/health || exit 1

CMD ["node", "index.js"]
