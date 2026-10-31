# Lumen: build the static app, then serve it with nginx in front of SeerrNG.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# SEERR_URL = where SeerrNG listens, e.g. http://seerrng:5055
# SEERR_PUBLIC_URL = the address people use for full SeerrNG ("Advanced"), baked in at build if wanted
ENV SEERR_URL=http://seerrng:5055
# companion proxy for narrator extras; without one these calls fail and Lumen uses SeerrNG alone
ENV SEERR_EXTRAS_URL=http://127.0.0.1:9
# full SeerrNG, for pages Lumen doesn't have (issues, settings, users...)
ENV SEERR_FULL_URL=http://seerrng:5055
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
