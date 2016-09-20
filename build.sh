
export NODE_ENV=production

# clean
rm -fr build/*
rm -fr bert-shell-win32-ia32
rm -fr bert-shell-win32-x64

# build
webpack -p

# install node modules
cd build
npm install --production

# now package
cd ..
node_modules/.bin/electron-packager build --platform=win32 --icon=icon.ico
