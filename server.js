
const express = require( 'express' );
const webpack = require( 'webpack' );
const webpackDevMiddleware = require('webpack-dev-middleware');
const webpackHotMiddleware = require('webpack-hot-middleware');

//import express from 'express';
//import webpack from 'webpack';
//import webpackDevMiddleware from 'webpack-dev-middleware';
//import webpackHotMiddleware from 'webpack-hot-middleware';

//import config from './webpack.config.development';
//const config = require('./webpack.config.development');
const config = require('./webpack.config.js');

const compiler = webpack(config);
const app = express();

app.use(webpackDevMiddleware(compiler, {
  publicPath: config.output.publicPath,
  stats: {
    colors: true
  }
}));

app.use(webpackHotMiddleware(compiler));

app.listen(9000);