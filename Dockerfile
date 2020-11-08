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
    font-noto-cjk \
    font-noto-cjk-extra \
    ;

WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build


# ENTRYPOINT ["npm", "run" "start"]