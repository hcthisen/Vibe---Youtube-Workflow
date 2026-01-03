FROM node:20-alpine

WORKDIR /app

# Install dependencies at root so they are accessible to both the worker
# and the imported code from apps/web (which traverses up looking for node_modules)
COPY workers/search-processor/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy worker source
COPY workers/search-processor /app/workers/search-processor/

# Copy the tool registry + handlers the worker imports at runtime
COPY apps/web/src/lib /app/apps/web/src/lib/

ENV NODE_ENV=production

WORKDIR /app/workers/search-processor
CMD ["npm", "start"]

