#!/bin/sh

set -xe

[ -d kuromoji-js-dictionary ] || git clone -b master --single-branch --depth=1 https://github.com/sable-virt/kuromoji-js-dictionary.git
cd kuromoji-js-dictionary
npm ci
npm run xz
npm run tar
./bin/run
mv dist ../dict