FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/
RUN npm ci --workspace=packages/shared --workspace=apps/frontend

FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend
RUN npm run build --workspace=packages/shared
RUN npm run build --workspace=apps/frontend

FROM nginx:alpine AS runner
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
