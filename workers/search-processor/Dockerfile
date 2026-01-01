FROM node:20-alpine

WORKDIR /app

# Install dependencies for the worker itself (do not rely on other workspace packages)
COPY workers/search-processor/package*.json ./workers/search-processor/
WORKDIR /app/workers/search-processor
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy worker source
COPY workers/search-processor ./workers/search-processor/

# Copy the tool registry + handlers the worker imports at runtime
COPY apps/web/src/lib ./apps/web/src/lib/

ENV NODE_ENV=production

CMD ["npm", "start"]


