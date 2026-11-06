FROM ghcr.io/snapetech-org/seerrng:v3.72.16@sha256:b2bd0d2288898efcdb602f1f4863e86dff3fed1cfba5641d54072ab4702942fa

USER root
RUN rm -rf /app/.next/cache && \
    ln -s /tmp/seerrng-next-cache /app/.next/cache
COPY start-cloudron.cjs /app/start-cloudron.cjs
ENV CONFIG_DIRECTORY=/app/data HOST=0.0.0.0 PORT=5055
CMD ["node", "/app/start-cloudron.cjs"]
