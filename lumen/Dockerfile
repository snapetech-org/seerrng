# Lumen: build the static app, then serve it with nginx in front of SeerrNG.
FROM mirror.gcr.io/library/node:24.22.1-alpine3.23@sha256:4b00b6d1aa138805aace94cc2482808f2b4f01e5e9c9f8cdc0e217fd70600ef9 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.30.6-alpine@sha256:0e52bd054126cdc040b1276c0af347aeb02a41b9cfe305d6094767ac30e97949
# SEERR_URL = where SeerrNG listens, e.g. http://seerrng:5055
# SEERR_PUBLIC_URL = the address people use for full SeerrNG ("Advanced"), baked in at build if wanted
ENV SEERR_URL=http://seerrng:5055
# companion proxy for narrator extras; without one these calls fail and Lumen uses SeerrNG alone
ENV SEERR_EXTRAS_URL=http://127.0.0.1:9
# full SeerrNG, for pages Lumen doesn't have (issues, settings, users...)
ENV SEERR_FULL_URL=http://seerrng:5055
# reverse proxy/tunnel in front of Lumen whose forwarding headers are believed (none by default)
ENV LUMEN_TRUSTED_PROXIES=
ENV LUMEN_REAL_IP_HEADER=X-Forwarded-For
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY deploy/15-lumen-trusted-proxies.sh /docker-entrypoint.d/15-lumen-trusted-proxies.sh
RUN chmod 755 /docker-entrypoint.d/15-lumen-trusted-proxies.sh
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
