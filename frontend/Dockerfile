FROM node:24-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY index.html ./
COPY ["Mapa de Pantallas.html", "./"]
COPY js ./js
COPY styles ./styles
COPY scripts ./scripts
COPY assets ./assets
COPY favicon.svg ./favicon.svg
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV API_PROXY_TARGET=http://api:8000
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "server.js"]
