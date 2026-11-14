FROM oven/bun:1.2.10 AS builder
WORKDIR /app

# Create .env file with printf
RUN printf '%s\n'                                               \
    'VITE_BETTER_AUTH_BASE_URL=___VITE_BETTER_AUTH_BASE_URL___' \
    'VITE_API_BASE_URL=___VITE_API_BASE_URL___'                 \
    'VITE_MINIO_BASE_URL=___VITE_MINIO_BASE_URL___'             \
    'CADDY_PROXY_URL=___CADDY_PROXY_URL___'                     \
    > .env

COPY bun.lock package.json ./
RUN bun install --frozen-lockfile
COPY . .
RUN bunx --bun vite build

FROM caddy:alpine
COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
RUN printf '%s\n'                                                                        \
    '#!/bin/sh'                                                                          \
    'for file in /srv/assets/*.js; do'                                                  \
    '    [ -f "$file" ] || continue'                                                     \
    '    sed -i "s|___VITE_BETTER_AUTH_BASE_URL___|${VITE_BETTER_AUTH_BASE_URL}|g" $file'\
    '    sed -i "s|___VITE_API_BASE_URL___|${VITE_API_BASE_URL}|g" $file'                \
    '    sed -i "s|___VITE_MINIO_BASE_URL___|${VITE_MINIO_BASE_URL}|g" $file'            \
    '    sed -i "s|___CADDY_PROXY_URL___|${CADDY_PROXY_URL}|g" $file'                     \
    'done'                                                                               \
    'sed -i "s|replace_me|${CADDY_PROXY_URL}|g" /etc/caddy/Caddyfile'                    \
    'caddy run --config /etc/caddy/Caddyfile --adapter caddyfile'                        \
    > /entrypoint.sh

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
