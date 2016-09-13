
var webpack = require('webpack');
module.exports = {
  entry: {
  app: ['webpack/hot/dev-server', './src/script/renderer.js'],
},
target: "node",
output: {
  path: './dist',
  filename: 'bundle.js',
  publicPath: 'http://localhost:8080/built/'
},
devServer: {
  contentBase: './dist',
  publicPath: 'http://localhost:8080/built/'
},
module: {
 loaders: [
   { test: /\.css$/, loader: 'style-loader!css-loader' }
 ]
},
 plugins: [
   new webpack.HotModuleReplacementPlugin()
 ]
}

/*
var webpack = require('webpack');

var config = {
  entry: {
    app: ['webpack/hot/dev-server', './src/script/renderer.js'],
  },
  module: {
    loaders: [
    {
      test: /\.css$/,
      loader: 'style!css-loader?modules&importLoaders=1&localIdentName=[name]__[local]___[hash:base64:5]!postcss-loader'
    }, {
      test: /\.png|\.svg$/,
      loaders: ['file-loader']
    }]
  },

output: {
  path: './dist',
  filename: 'bundle.js',
  publicPath: 'http://localhost:8080/built/'
},
devServer: {
  contentBase: './dist',
  publicPath: 'http://localhost:8080/built/'
},

  resolve: {
    extensions: ['', '.js', '.jsx'],
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
  ]
};

config.target = webpackTargetElectronRenderer(config);

module.exports = config;

*/