#!/bin/sh
set -e

MINIO_DEFAULT_BUCKET="${MINIO_DEFAULT_BUCKET:-forgejo}"

# Start MinIO in the background so we can create the default bucket
minio server /data --console-address ":9001" &
MINIO_PID=$!

# Wait for MinIO to become ready
until mc alias set local http://127.0.0.1:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null 2>&1; do
  sleep 1
done

# Create the default bucket if it doesn't exist
mc mb --ignore-existing "local/${MINIO_DEFAULT_BUCKET}"

echo "MinIO ready — bucket '${MINIO_DEFAULT_BUCKET}' available"

# Hand off to the MinIO process
wait $MINIO_PID
