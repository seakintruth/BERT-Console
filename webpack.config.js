
"use strict";

const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const mkdirp = require('mkdirp');

// const { LoaderOptionsPlugin } = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');
const Uglify = require( "uglify-js" );

let htmlOptions = ( process.env.NODE_ENV === "production" ) ? {
  removeAttributeQuotes: true,
  removeComments: true,
  minifyJS: true,
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
      { from: 'package.json' },
      { from: 'yarn.lock' }
    ])
  ]
};

