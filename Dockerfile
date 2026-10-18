FROM node:24-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NODE_USE_ENV_PROXY=1
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-core ca-certificates && rm -rf /var/lib/apt/lists/*
FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build
FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node","server.js"]
FROM dependencies AS worker
COPY scripts ./scripts
COPY src/lib ./src/lib
COPY tsconfig.json ./
COPY supabase ./supabase
RUN mkdir -p /app/.data && chown -R node:node /app
USER node
CMD ["npm","run","worker"]
