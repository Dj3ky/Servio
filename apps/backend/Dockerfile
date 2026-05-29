FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
# Skip bundled Chrome download — production uses Alpine's chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
RUN npm ci --workspace=packages/shared --workspace=apps/backend

FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/backend

FROM base AS runner
# Install Chromium and its shared-library dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont
ENV NODE_ENV=production
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY apps/backend/package.json ./apps/backend/package.json
WORKDIR /app/apps/backend
EXPOSE 3001
CMD ["node", "dist/server.js"]
