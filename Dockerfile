FROM ubuntu AS font-getter
ENV MGENPLUS_URL https://osdn.jp/downloads/users/8/8599/rounded-x-mgenplus-20150602.7z
ENV MGENPLUS_FONT rounded-x-mgenplus-2pp-black.ttf

RUN apt-get update && apt-get install -y -qq p7zip-full wget

# font from http://jikasei.me/font/rounded-mgenplus/
WORKDIR /app
RUN wget -q -O font.7z $MGENPLUS_URL
RUN 7z e font.7z $MGENPLUS_FONT && mv $MGENPLUS_FONT font.ttf

FROM node:lts-alpine AS dict-getter
RUN apk add \
    git \
    git-lfs \
    xz \
    ;

RUN git-fs install
RUN git clone -b master --single-branch --depth=1 https://github.com/sable-virt/kuromoji-js-dictionary.git /app/kuromoji-js-dictionary
WORKDIR /app/kuromoji-js-dictionary
RUN npm ci
RUN npm run xz
RUN npm run tar
RUN ./bin/run && mv dist ../dict

FROM node:lts-alpine AS builder

RUN apk add \
    build-base \
    g++ \
    libpng-dev \
    jpeg-dev \
    pango-dev \
    cairo-dev \
    giflib-dev \
    python \
    p7zip \
    ;

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build
RUN npm prune

FROM node:lts-alpine
RUN apk add --no-cache \
    libpng \
    jpeg \
    pango \
    cairo \
    giflib \
    ; 

WORKDIR /app
COPY --from=font-getter /app/font.ttf /app/font.ttf
COPY --from=dict-getter /app/dict /app/dict
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/lib /app/lib

# ENTRYPOINT ["npm", "run" "start"]