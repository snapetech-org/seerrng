# Lumen: build the static app, then serve it with nginx in front of SeerrNG.
FROM mirror.gcr.io/library/node:24.22.1-alpine3.23@sha256:4b00b6d1aa138805aace94cc2482808f2b4f01e5e9c9f8cdc0e217fd70600ef9 AS build
WORKDIR /app/lumen
RUN apk upgrade --no-cache zlib
COPY lumen/package.json lumen/package-lock.json ./
RUN npm ci
COPY lumen/ .
COPY config/i18n/locales.json /app/config/i18n/locales.json
COPY src/i18n/locale/ /app/src/i18n/locale/
COPY src/assets/tmdb_logo.svg /app/src/assets/tmdb_logo.svg
COPY src/utils/advancedThemePresets.ts \
     src/utils/creditPriority.ts \
     src/utils/imdbWatchlistCsv.ts \
     src/utils/numberHelpers.ts \
     src/utils/safeUrl.ts \
     /app/src/utils/
COPY server/constants/issue.ts /app/server/constants/issue.ts
COPY server/utils/advancedThemeOverrides.ts /app/server/utils/advancedThemeOverrides.ts
RUN npm run build

FROM nginx:1.30.7-alpine@sha256:bef154735288bc38d99fac41ae63730684bcc661503673a04a0f9bc526ba8598
# The pinned image can lag Alpine's security rebuilds; refresh the runtime libraries
# used by nginx's bundled XSLT module before the unprivileged runtime stage.
RUN apk upgrade --no-cache libxml2 libxslt zlib
# SEERR_URL (or SEERR_INTERNAL_URL) = how this container reaches SeerrNG, e.g. http://seerrng:5055
ENV SEERR_URL=http://seerrng:5055
# SEERR_FULL_URL (or SEERR_BROWSER_URL) = the address people open full SeerrNG at, for
# pages Lumen doesn't have (issues, settings, users...)
ENV SEERR_FULL_URL=http://seerrng:5055
# reverse proxy/tunnel in front of Lumen whose forwarding headers are believed (none by default)
ENV LUMEN_TRUSTED_PROXIES=
ENV LUMEN_REAL_IP_HEADER=X-Forwarded-For
COPY lumen/deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY lumen/deploy/05-lumen-env-aliases.envsh /docker-entrypoint.d/05-lumen-env-aliases.envsh
COPY lumen/deploy/15-lumen-trusted-proxies.sh /docker-entrypoint.d/15-lumen-trusted-proxies.sh
RUN chmod 755 /docker-entrypoint.d/05-lumen-env-aliases.envsh /docker-entrypoint.d/15-lumen-trusted-proxies.sh
COPY --from=build /app/lumen/dist /usr/share/nginx/html
# "Lumen settings for everyone" are saved by a small nginx script (njs, shipped with this
# image) into /lumen-data: a folder the installer mounts, writable by user 101 (nginx). It is
# deliberately not created here, so settings are never saved inside a container that an
# update would replace. Without it the admin page offers lumen-config.json as a download.
COPY lumen/deploy/lumen-config.js /etc/nginx/lumen/lumen-config.js
RUN sed -i '1i load_module modules/ngx_http_js_module.so;' /etc/nginx/nginx.conf
# The entrypoint renders only proxy configuration. Everything nginx writes (that
# configuration, its temporary files and PID) goes under /tmp, so the image runs as any
# unprivileged user: nginx (101) by default, or e.g. `user: "1000:1000"` in compose to match
# the owner of the mounted /lumen-data folder. The static app stays read-only.
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/lumen/conf.d
RUN sed -i \
      -e 's@/run/nginx.pid@/tmp/nginx.pid@' \
      -e 's@include /etc/nginx/conf.d/\*.conf;@include /tmp/lumen/conf.d/*.conf;@' \
      -e 's@^http {@http {\n    client_body_temp_path /tmp/lumen/client_temp;\n    proxy_temp_path /tmp/lumen/proxy_temp;\n    fastcgi_temp_path /tmp/lumen/fastcgi_temp;\n    uwsgi_temp_path /tmp/lumen/uwsgi_temp;\n    scgi_temp_path /tmp/lumen/scgi_temp;@' \
      /etc/nginx/nginx.conf && \
    grep -q 'include /tmp/lumen/conf.d/\*.conf;' /etc/nginx/nginx.conf && \
    grep -q 'client_body_temp_path /tmp/lumen/client_temp;' /etc/nginx/nginx.conf && \
    rm -f /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 80
