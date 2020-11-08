FROM node:lts-alpine

RUN apk add --no-cache \
    build-base \
    g++ \
    libpng \
    libpng-dev \
    jpeg-dev \
    pango-dev \
    cairo-dev \
    giflib-dev \
    python \
    ;

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
RUN apk add --no-cache font-noto-cjk font-noto-cjk-extra
COPY src ./src
RUN npm run build


# ENTRYPOINT ["npm", "run" "start"]