#!/bin/sh
set -e

# A mounted volume replaces whatever the image had at that path, and arrives
# owned by root. The app runs as `node`, so ownership has to be fixed at run
# time - doing it in the Dockerfile only affects the image, which the mount then
# hides. This is why the container starts as root and drops privileges here.
DATA_DIR="${DATA_DIR:-/data}"
UPLOAD_DIR="${UPLOAD_DIR:-$DATA_DIR/uploads}"

mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$DATA_DIR"
  exec su-exec node "$@"
fi

# Already unprivileged (some platforms pin the user); carry on and let a genuine
# permission problem surface as a real error rather than being masked.
exec "$@"
