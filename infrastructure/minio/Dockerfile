FROM minio/minio:latest

LABEL org.opencontainers.image.source="https://github.com/jacobprall/openforge"
LABEL org.opencontainers.image.description="openforge: MinIO object storage"

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 9000
EXPOSE 9001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
