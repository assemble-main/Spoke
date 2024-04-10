### Dependency Cacher
### -------------------------
FROM endeveit/docker-jq:latest as deps

# To prevent cache invalidation from changes in fields other than dependencies
# https://stackoverflow.com/a/59606373
COPY package.json /tmp
RUN jq '{ dependencies, devDependencies, resolutions }' < /tmp/package.json > /tmp/deps.json


### Fat Build
### -------------------------
FROM node:18.16.0 AS builder

WORKDIR /usr/Spoke

# Cache dependencies
COPY --from=deps /tmp/deps.json ./package.json
COPY yarn.lock ./
RUN yarn install

# Configure build environment
ARG PHONE_NUMBER_COUNTRY=US
ENV NODE_ENV="production" \
  NODE_OPTIONS=--max_old_space_size=2048 \
  PORT=3000 \
  OUTPUT_DIR="./build" \
  PUBLIC_DIR="./build/client" \
  ASSETS_DIR="./build/client/assets" \
  ASSETS_MAP_FILE="assets.json" \
  PHONE_NUMBER_COUNTRY=$PHONE_NUMBER_COUNTRY

# Copy application codebase
COPY . .
RUN yarn run build

### Slim Deploy
### -------------------------
FROM node:18.16.0

WORKDIR /usr/Spoke

# Install and cache production dependencies
COPY --from=deps /tmp/deps.json ./package.json
COPY yarn.lock ./
RUN yarn install --production

# Copy only the built source
COPY --from=builder /usr/Spoke/build ./build

ARG SPOKE_VERSION="no-version"
ARG PHONE_NUMBER_COUNTRY=US
ENV NODE_ENV="production" \
  NODE_OPTIONS=--max_old_space_size=2048 \
  PORT=3000 \
  OUTPUT_DIR="./build" \
  PUBLIC_DIR="./build/client" \
  ASSETS_DIR="./build/client/assets" \
  ASSETS_MAP_FILE="assets.json" \
  VAN_BASE_URL="https://api.securevan.com/v4" \
  VAN_EXPORT_TYPE="8" \
  PHONE_NUMBER_COUNTRY=$PHONE_NUMBER_COUNTRY \
  SPOKE_VERSION=$SPOKE_VERSION

COPY package.json knexfile.env.js ./
COPY migrations ./migrations
COPY seeds ./seeds

# Run the production compiled code
EXPOSE 3000
CMD [ "node", "--no-deprecation", "./build/src/server" ]
