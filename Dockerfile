# Base image
FROM node:18.20-alpine

WORKDIR /app

# Cài các gói cần thiết cho Prisma + bash để dùng wait-for-it.sh
RUN apk add --no-cache openssl-dev bash

# Copy toàn bộ project vào
COPY . .

ENV PRISMA_CLI_QUERY_ENGINE_TYPE="binary"
ENV PRISMA_CLI_QUERY_ENGINE_BINARY_TARGETS="linux-musl-openssl-3.0.x"

# Cài đặt toàn bộ dependencies (bao gồm cả dev)
RUN npm install

# Generate Prisma Client
RUN npx prisma generate

# Build mã nguồn TypeScript
RUN npm run build
RUN cp src/generated/prisma/*linux-musl-openssl-3.0.x* dist/generated/prisma/


COPY wait-for-it.sh /usr/local/bin/wait-for-it.sh
RUN sed -i 's/\r$//' /usr/local/bin/wait-for-it.sh
# Cho phép wait-for-it chạy được
RUN chmod +x /usr/local/bin/wait-for-it.sh

# Expose port
EXPOSE 3000

# Chờ database sẵn sàng trước khi start
ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "postgres-db:5432", "--timeout=60", "--"]
CMD ["node", "dist/server.js"]


# Không thể muiltstage build vì err prisma version =(((

# -------------------------------------
# # 🔹 1. Base image
# # -------------------------------------
# FROM node:18.20-alpine AS base
# WORKDIR /app

# # -------------------------------------
# # 🔹 2. Deps stage - cài full deps (cả dev)
# # -------------------------------------
# FROM base AS deps
# COPY package*.json ./
# RUN npm install  # ❗ Không bỏ dev để build được Prisma


# # -------------------------------------
# # 🔹 3. Build stage
# # -------------------------------------
# FROM base AS builder

# # Cài OpenSSL dev cho prisma
# RUN apk add --no-cache openssl-dev

# COPY --from=deps /app/node_modules ./node_modules
# COPY --from=deps /app/package*.json ./

# # Copy mã nguồn và cấu hình
# COPY prisma ./prisma
# COPY src ./src
# COPY tsconfig.json ./

# # ✅ Generate client đúng trong môi trường alpine (linux-musl)
# RUN npx prisma generate
# RUN npm run build

# # -------------------------------------
# # 🔹 4. Final stage
# # -------------------------------------
# FROM base AS final

# # Cài bash để chạy wait-for-it.sh
# RUN apk add --no-cache bash

# # Cài wait-for-it
# COPY wait-for-it.sh /usr/local/bin/wait-for-it.sh
# RUN chmod +x /usr/local/bin/wait-for-it.sh

# # Copy cần thiết từ builder
# COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/prisma ./prisma
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/node_modules/.prisma /app/node_modules/.prisma
# COPY --from=builder /app/package*.json ./

# EXPOSE 3000

# # ✅ Chờ Postgres xong rồi chạy server
# ENTRYPOINT ["/usr/local/bin/wait-for-it.sh", "postgres-db:5432", "--timeout=60", "--"]
# CMD ["node", "dist/server.js"]
