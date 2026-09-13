# Portable image: runs on Railway, Fly.io, Koyeb, Cloud Run, or any VM with
# Docker. No build step and no native modules, so the build is a dependency
# install and a copy.
FROM node:22-alpine

# tini reaps zombies and forwards SIGTERM so the container stops promptly.
# su-exec drops privileges in the entrypoint after the volume is made writable.
RUN apk add --no-cache tini su-exec

WORKDIR /app

# Copied first so `npm ci` is cached until the dependency set actually changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY app ./app
COPY tools ./tools
COPY IAMSREE ./IAMSREE
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app

# Writable state lives here so a single mounted volume covers both the database
# and the uploaded images. Without a volume at /data, every admin edit is lost
# when the container restarts.
#
# PORT is only a fallback: hosts that inject their own (Railway does) override it.
ENV DATA_DIR=/data \
    DATABASE_PATH=/data/site.db \
    UPLOAD_DIR=/data/uploads \
    UPLOAD_URL_PREFIX=images/uploads \
    NODE_ENV=production \
    TRUST_PROXY=1 \
    PORT=8080

EXPOSE 8080

# Starts as root so the entrypoint can take ownership of the mounted volume,
# then runs the app as `node`.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]

# Applies any new columns and seeds an empty database, then starts. Both steps
# are idempotent, so this is safe on every boot including restarts.
CMD ["sh", "-c", "node app/db/migrate.js && node app/db/seed.js && node app/server.js"]
