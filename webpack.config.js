
"use strict"

const { LoaderOptionsPlugin } = require('webpack');

const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const mkdirp = require('mkdirp');

const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

let htmlOptions = ( process.env.NODE_ENV === "production" ) ? {
  removeAttributeQuotes: true,
  removeComments: true,
  collapseWhitespace: true
} : false ;

module.exports = {
  target: "electron",
  entry: { bundle: "./src/script/renderer.js" },
  output: {
    filename: "[name].js",
    path: path.resolve("./build")
  },
  module: {
    loaders: [
      { test: /\.html$/, loader: 'html-loader?interpolate' },
      { test: /\.json$/, loader: 'json-loader' },
      { test: /\.css$/, loader: [ 'style-loader', 'css-loader' ] }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      minify: htmlOptions,
      template: './src/root/index.html',
      inject: false,
      attrs: false
    }),
    new UglifyJSPlugin(),
    new CopyWebpackPlugin([
      { from: 'ext' },
      { from: 'doc' },
      { from: 'src/root' },
      { from: 'package.json' }
    ])
  ]
};

/*
const webpack = require('webpack');

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
      { from: 'doc' },
      { from: 'src/root' },
      { from: 'package.json' }
    ]),
    new HtmlWebpackPlugin({
      minify: htmlOptions,
      template: './src/root/index.html',
      inject: false,
      attrs: false
    })
  ]
}
*/

