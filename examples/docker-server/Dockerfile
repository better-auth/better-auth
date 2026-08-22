# Minimal container for a self-hosted Better Auth server. Runs the TypeScript
# entrypoint directly with tsx to keep the example short; see the deployment
# guide for a compiled multi-stage build.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# Install deps first for better layer caching.
COPY package.json ./
RUN npm install

COPY . .

# Run as the built-in non-root user.
USER node

EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
