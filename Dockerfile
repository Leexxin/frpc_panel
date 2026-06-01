FROM node:20-alpine AS builder

# 安装必要的工具
RUN apk add --no-cache git

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS production

WORKDIR /app

# 安装 Docker CLI，用于与宿主机 Docker 通信
RUN apk add --no-cache docker-cli

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/shared ./shared

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "--import", "tsx/esm", "api/server.ts"]