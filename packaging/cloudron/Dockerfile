FROM ghcr.io/snapetech-org/seerrng:v3.72.20@sha256:d3ac93c938c80a46563f1091ad06b4b75c6f2b7e0b1f6cbcb055ad87f2f46804

USER root
RUN rm -rf /app/.next/cache && \
    ln -s /tmp/seerrng-next-cache /app/.next/cache
COPY start-cloudron.cjs /app/start-cloudron.cjs
ENV CONFIG_DIRECTORY=/app/data HOST=0.0.0.0 PORT=5055
CMD ["node", "/app/start-cloudron.cjs"]
