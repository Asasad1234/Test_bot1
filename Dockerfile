FROM node:20-alpine AS builder

WORKDIR /app

COPY Test_bot-main/Bot_nastroyki-main/package*.json ./
RUN npm install

COPY Test_bot-main/Bot_nastroyki-main/ ./
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV AUTO_RESTART_HOURS=24
ENV TZ=Europe/Moscow

RUN apk add --no-cache curl bash tzdata

COPY Test_bot-main/Bot_nastroyki-main/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY Test_bot-main/Bot_nastroyki-main/data-store.json.example ./data-store.json.initial
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json
COPY Test_bot-main/Bot_nastroyki-main/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=8s --start-period=15s --retries=3 \
  CMD curl -f "http://localhost:${PORT:-3000}/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
