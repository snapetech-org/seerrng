ARG BUILDPLATFORM
ARG TARGETPLATFORM

FROM mirror.gcr.io/library/node:24.22.1-alpine3.23@sha256:4b00b6d1aa138805aace94cc2482808f2b4f01e5e9c9f8cdc0e217fd70600ef9 AS target-base
ARG SOURCE_DATE_EPOCH
ARG TARGETPLATFORM
ENV TARGETPLATFORM=${TARGETPLATFORM:-linux/amd64}

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV npm_config_nodedir="/usr/local"
RUN apk add --no-cache python3 py3-setuptools make g++ gcc libc6-compat bash && \
  npm config set fetch-retries 5 && \
  npm config set fetch-retry-mintimeout 20000 && \
  npm config set fetch-retry-maxtimeout 120000 && \
  npm install --global node-gyp@13.0.2 pnpm@10.24.0

FROM target-base AS prod-deps

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY bin/prepare.mjs ./bin/prepare.mjs
COPY patches ./patches

RUN --mount=type=cache,id=pnpm-prod,target=/pnpm/store CI=true pnpm --config.engine-strict=true install --prod --frozen-lockfile

# Remove large native modules for linux-x64-gnu platform (we use alpine which is musl-based)
# not supported in pnpm for now due to this bug: https://github.com/pnpm/pnpm/issues/9654
RUN du -shL ./node_modules/.pnpm/* | grep '[0-9]M.*' | grep 'linux-x64-gnu@' | awk '{print $2}' | xargs rm -rf
# Remove large module files not needed for production
RUN if [ -d node_modules/.pnpm ]; then \
  find node_modules/.pnpm -type d \( \
  -path "*ace-builds/src-noconflict" -o \
  -path "*ace-builds/src" -o \
  -path "*ace-builds/src-min" -o \
  -path "*country-flag-icons/react" -o \
  -path "*country-flag-icons/string" -o \
  -path "*country-flag-icons/1x1" -o \
  -path "*@heroicons/react/16" \
  \) -exec rm -rf {} + || true; \
  fi

# Remove dependency source maps before copying production modules into the final image.
RUN find node_modules/.pnpm -type f -name '*.map' -delete

FROM --platform=$BUILDPLATFORM mirror.gcr.io/library/node:24.22.1-alpine3.23@sha256:4b00b6d1aa138805aace94cc2482808f2b4f01e5e9c9f8cdc0e217fd70600ef9 AS build-base
ARG SOURCE_DATE_EPOCH
ARG BUILDPLATFORM
ARG TARGETPLATFORM
ENV BUILDPLATFORM=${BUILDPLATFORM:-linux/amd64}
ENV TARGETPLATFORM=${TARGETPLATFORM:-linux/amd64}

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV npm_config_nodedir="/usr/local"
RUN apk add --no-cache python3 py3-setuptools make g++ gcc libc6-compat bash && \
  npm config set fetch-retries 5 && \
  npm config set fetch-retry-mintimeout 20000 && \
  npm config set fetch-retry-maxtimeout 120000 && \
  npm install --global node-gyp@13.0.2 pnpm@10.24.0

FROM build-base AS build

ARG COMMIT_TAG
ARG BUILD_VERSION=main
ENV COMMIT_TAG=${COMMIT_TAG}
ENV BUILD_VERSION=${BUILD_VERSION}

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY bin/prepare.mjs ./bin/prepare.mjs
COPY patches ./patches

RUN --mount=type=cache,id=pnpm-build,target=/pnpm/store CI=true CYPRESS_INSTALL_BINARY=0 pnpm --config.engine-strict=true install --frozen-lockfile

COPY . .

RUN pnpm i18n:check && pnpm build:next && pnpm build:server

RUN rm -rf .next/cache

FROM mirror.gcr.io/library/node:24.22.1-alpine3.23@sha256:4b00b6d1aa138805aace94cc2482808f2b4f01e5e9c9f8cdc0e217fd70600ef9
ARG SOURCE_DATE_EPOCH
ARG COMMIT_TAG
ARG BUILD_VERSION=main
ENV NODE_ENV=production
ENV COMMIT_TAG=${COMMIT_TAG}
ENV BUILD_VERSION=${BUILD_VERSION}

RUN apk add --no-cache --upgrade libcrypto3 libssl3 tzdata && \
  rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

USER node:node

WORKDIR /app

COPY --chown=node:node package.json next.config.mjs seerr-api.yml ./
COPY --chown=node:node public ./public
COPY --chown=node:node scripts/export-external-config.mjs ./scripts/export-external-config.mjs
COPY --chown=node:node scripts/healthcheck.mjs ./scripts/healthcheck.mjs
COPY --chown=node:node scripts/interface-theme.mjs ./scripts/interface-theme.mjs
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/dist ./dist

RUN mkdir -p config && \
  touch config/DOCKER && \
  echo "{\"commitTag\": \"${COMMIT_TAG}\", \"buildVersion\": \"${BUILD_VERSION}\"}" > committag.json

EXPOSE 5055 5056

CMD [ "node", "dist/index.js" ]
