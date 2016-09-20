
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

let htmlOptions = ( process.env.NODE_ENV === "production" ) ? {
  removeAttributeQuotes: true,
  removeComments: true,
  collapseWhitespace: true
} : false ;

module.exports = {
  entry: {
    app: ['webpack/hot/dev-server', './src/script/renderer.js'],
  },
  target: "node",
  output: {
    path: './build',
    filename: 'bundle.js',
    publicPath: 'http://localhost:8080/built/'
  },
  devServer: {
    contentBase: './build',
    publicPath: 'http://localhost:8080/built/'
  },
  module: {
    loaders: [
      { test: /\.css$/, loader: 'style-loader!css-loader' },
      { test: /\.json$/, loader: 'json' },
      { test: /\.template.html$/, loader: 'raw' },
    ]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new CopyWebpackPlugin([
      { from: 'ext' },
      { from: 'src/root' }
    ]),
    new HtmlWebpackPlugin({
      minify: htmlOptions,
      template: './src/root/index.html',
      inject: false,
      attrs: false
    })
  ]
}
