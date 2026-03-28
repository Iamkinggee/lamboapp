# # ============================================================
# # FILE: services/api-server/Dockerfile
# # PURPOSE: Container for the Node.js Fastify API server
# # ============================================================

# FROM node:20-alpine

# WORKDIR /app

# # Install deps (cached layer)
# COPY package*.json ./
# RUN npm ci --only=production

# COPY . .

# # Build TypeScript
# RUN npm run build

# EXPOSE 3001
# CMD ["node", "dist/index.js"]





# FILE: services/api-server/Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package.json .
RUN npm install

COPY . .
RUN npm run build

RUN adduser -D appuser && chown -R appuser /app
USER appuser

EXPOSE 3001
CMD ["node", "dist/index.js"]