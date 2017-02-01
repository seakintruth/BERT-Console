
# we now always set this; to build debug run directly.

export NODE_ENV=production

# clean
rm -fr build/*
rm -fr bert-shell-win32-ia32
rm -fr bert-shell-win32-x64

# build
./node_modules/.bin/webpack -p

# install node modules.  note this is always production.
cd build
yarn install --production

# now package
cd ..
node_modules/.bin/electron-packager build --platform=win32 --arch=all --icon=icon.ico
