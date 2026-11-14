FROM oven/bun:1.2.9-alpine AS base
WORKDIR /app

FROM base AS build
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY . .
RUN bun run build

FROM base AS release
WORKDIR /app
COPY --from=build /app/package.json /app/
COPY --from=build /app/dist/ /app/dist
COPY --from=build /app/drizzle/ /app/drizzle
COPY --from=build /app/base_issue_types.txt /app/base_issue_types.txt
ENTRYPOINT ["bun", "start"]

