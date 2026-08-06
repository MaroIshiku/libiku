# syntax=docker/dockerfile:1.7

ARG LIBATION_REPO=https://github.com/rmcrackan/Libation.git
ARG LIBATION_REF=7b09a3bfef39c2f6ab28f526b179cb11d3b8360e
ARG SQLITEPCLRAW_BUNDLE_VERSION=2.1.12

FROM --platform=${BUILDPLATFORM} mcr.microsoft.com/dotnet/sdk:10.0@sha256:72dd743782f2ae7e5476fd64f6a460045e3998dc862218b80e6944cba79a01b0 AS libation-build
ARG TARGETARCH
ARG LIBATION_REPO
ARG LIBATION_REF
ARG SQLITEPCLRAW_BUNDLE_VERSION

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git init Libation \
    && git -C Libation remote add origin "${LIBATION_REPO}" \
    && git -C Libation fetch --depth 1 origin "${LIBATION_REF}" \
    && git -C Libation checkout --detach FETCH_HEAD \
    && test "$(git -C Libation rev-parse HEAD)" = "${LIBATION_REF}"

# Libation v13.7.5 resolves SQLitePCLRaw 2.1.11 transitively. Pin the
# upstream-compatible patched bundle so the published CLI carries SQLite >=3.50.2.
RUN dotnet add \
      /src/Libation/Source/LibationCli/LibationCli.csproj \
      package SQLitePCLRaw.bundle_e_sqlite3 \
      --version "${SQLITEPCLRAW_BUNDLE_VERSION}" \
      --no-restore

RUN case "${TARGETARCH}" in \
      amd64) DOTNET_ARCH=x64 ;; \
      arm64) DOTNET_ARCH=arm64 ;; \
      arm) DOTNET_ARCH=arm ;; \
      *) DOTNET_ARCH="${TARGETARCH}" ;; \
    esac \
    && dotnet publish \
      /src/Libation/Source/LibationCli/LibationCli.csproj \
      --os linux-musl \
      --arch "${DOTNET_ARCH}" \
      --configuration Release \
      --output /out/libation \
      -p:PublishProtocol=FileSystem \
      -p:PublishReadyToRun=true \
      -p:SelfContained=true

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

ARG USER_UID=1001
ARG USER_GID=1001
ARG LIBIKU_VERSION=dev
ARG LIBIKU_COMMIT=unknown
ARG LIBIKU_BUILD_DATE=unknown

ENV NODE_ENV=production
ENV LIBIKU_VERSION=${LIBIKU_VERSION}
ENV LIBIKU_COMMIT=${LIBIKU_COMMIT}
ENV LIBIKU_BUILD_DATE=${LIBIKU_BUILD_DATE}
ENV PORT=3000
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV ISHIKU_SETUP_SECRET_FILE=/run/secrets/ishiku_setup_secret
ENV LIBIKU_AUTH_FILE=/config/LibikuAuth.json
ENV LIBIKU_AMAZON_LOGIN_TTL_SECONDS=900
ENV LIBATION_CLI=/libation/LibationCli
ENV LIBATION_FILES_DIR=/config
ENV LIBATION_CONFIG_DIR=/config
ENV LIBATION_DB_DIR=/db
ENV LIBATION_DB_FILE=
ENV LIBATION_BOOKS_DIR=/data
ENV PUBLIC_IP_URL=https://api.ipify.org?format=json
ENV PUBLIC_IP_INTERVAL_SECONDS=300

RUN apk upgrade --no-cache \
    && apk add --no-cache ca-certificates icu-libs sqlite tini util-linux-misc \
    && addgroup -g "${USER_GID}" libation \
    && adduser -D -u "${USER_UID}" -G libation -s /sbin/nologin libation \
    && mkdir -p /app /libation /config /db /data \
    && chown -R libation:libation /app /libation /config /db /data \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
COPY --from=libation-build /out/libation /libation
COPY package*.json ./
COPY server ./server
COPY public ./public

USER libation
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
