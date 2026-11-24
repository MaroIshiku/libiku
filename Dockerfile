# syntax=docker/dockerfile:1.7

ARG LIBATION_REPO=https://github.com/rmcrackan/Libation.git
# Libation v14.2.5
ARG LIBATION_REF=8003ae6f29ef28f057e1df994da13817dbdda670
ARG SQLITEPCLRAW_BUNDLE_VERSION=2.1.14

FROM --platform=${BUILDPLATFORM} mcr.microsoft.com/dotnet/sdk:10.0.404@sha256:8c6edfb26c85153f236d26efebd9ad349aec403583f343f201ee67838b23658d AS libation-build
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

# Libation v14.2.5 resolves SQLitePCLRaw 2.1.13 through EF Core 10.0.14.
# Use the current patch in the same bundle series.
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

FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a

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
