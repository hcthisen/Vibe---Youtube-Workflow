FROM node:20-alpine

WORKDIR /app

# Copy workspace root package files
COPY package*.json ./
COPY apps/web/package*.json ./apps/web/

# Install dependencies
RUN npm install

# Copy worker files
COPY workers/search-processor ./workers/search-processor/

# Copy necessary source files for tool execution
COPY apps/web/src/lib ./apps/web/src/lib/

WORKDIR /app/workers/search-processor

CMD ["npm", "start"]

