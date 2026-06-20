# syntax=docker/dockerfile:1.7

ARG LIBATION_REPO=https://github.com/rmcrackan/Libation.git
ARG LIBATION_REF=master

FROM --platform=${BUILDPLATFORM} mcr.microsoft.com/dotnet/sdk:10.0 AS libation-build
ARG TARGETARCH
ARG LIBATION_REPO
ARG LIBATION_REF

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --depth 1 --branch "${LIBATION_REF}" "${LIBATION_REPO}" Libation

RUN case "${TARGETARCH}" in \
      amd64) DOTNET_ARCH=x64 ;; \
      arm64) DOTNET_ARCH=arm64 ;; \
      arm) DOTNET_ARCH=arm ;; \
      *) DOTNET_ARCH="${TARGETARCH}" ;; \
    esac \
    && dotnet publish \
      /src/Libation/Source/LibationCli/LibationCli.csproj \
      --os linux \
      --arch "${DOTNET_ARCH}" \
      --configuration Release \
      --output /out/libation \
      -p:PublishProtocol=FileSystem \
      -p:PublishReadyToRun=true \
      -p:SelfContained=true

FROM node:22-bookworm-slim

ARG USER_UID=1001
ARG USER_GID=1001

ENV NODE_ENV=production
ENV PORT=3000
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV LIBATION_CLI=/libation/LibationCli
ENV LIBATION_FILES_DIR=/config
ENV LIBATION_CONFIG_DIR=/config
ENV LIBATION_DB_DIR=/db
ENV LIBATION_DB_FILE=
ENV LIBATION_BOOKS_DIR=/data
ENV PUBLIC_IP_URL=https://api.ipify.org?format=json
ENV PUBLIC_IP_INTERVAL_SECONDS=300

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl sqlite3 jq tini \
    && groupadd --gid "${USER_GID}" libation \
    && useradd --uid "${USER_UID}" --gid "${USER_GID}" --create-home --shell /usr/sbin/nologin libation \
    && mkdir -p /app /libation /config /db /data \
    && chown -R libation:libation /app /libation /config /db /data \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=libation-build /out/libation /libation
COPY package*.json ./
COPY server ./server
COPY public ./public

USER libation
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
