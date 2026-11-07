# Lumen: build the static app, then serve it with nginx in front of SeerrNG.
FROM mirror.gcr.io/library/node:24.22.1-alpine3.23@sha256:4b00b6d1aa138805aace94cc2482808f2b4f01e5e9c9f8cdc0e217fd70600ef9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30.6-alpine@sha256:e9b2d7624fd7957f4ed44ae0a272d93fb73aeb8512ba8916f8118ae6143fd115
# SEERR_URL (or SEERR_INTERNAL_URL) = how this container reaches SeerrNG, e.g. http://seerrng:5055
ENV SEERR_URL=http://seerrng:5055
# companion proxy for narrator extras; without one these calls fail and Lumen uses SeerrNG alone
ENV SEERR_EXTRAS_URL=http://127.0.0.1:9
# SEERR_FULL_URL (or SEERR_BROWSER_URL) = the address people open full SeerrNG at, for
# pages Lumen doesn't have (issues, settings, users...)
ENV SEERR_FULL_URL=http://seerrng:5055
# reverse proxy/tunnel in front of Lumen whose forwarding headers are believed (none by default)
ENV LUMEN_TRUSTED_PROXIES=
ENV LUMEN_REAL_IP_HEADER=X-Forwarded-For
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/05-lumen-env-aliases.envsh /docker-entrypoint.d/05-lumen-env-aliases.envsh
COPY deploy/15-lumen-trusted-proxies.sh /docker-entrypoint.d/15-lumen-trusted-proxies.sh
RUN chmod 755 /docker-entrypoint.d/05-lumen-env-aliases.envsh /docker-entrypoint.d/15-lumen-trusted-proxies.sh
COPY --from=build /app/dist /usr/share/nginx/html
# The entrypoint renders only proxy configuration. Keep the static app read-only
# while allowing the unprivileged master to write its config, cache and PID.
RUN sed -i 's@/run/nginx.pid@/tmp/nginx.pid@' /etc/nginx/nginx.conf && \
    chown -R nginx:nginx /etc/nginx/conf.d /var/cache/nginx
USER nginx
EXPOSE 80
