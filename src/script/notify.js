/**
 * Copyright (c) 2016 Structured Data, LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to 
 * deal in the Software without restriction, including without limitation the 
 * rights to use, copy, modify, merge, publish, distribute, sublicense, and/or 
 * sell copies of the Software, and to permit persons to whom the Software is 
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in 
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

"use strict";

require( "../style/notify.css" );
const Utils = require( "./utils.js" );

const DEFAULT_TIMEOUT = 3; // seconds

let panel = null;

const createPanel = function(){
  panel = document.createElement( "div" );
  panel.className = "notifier-panel";
  document.body.appendChild( panel );
};

/*
module.exports.notify = function( title, body, opts ){

  if( !panel ) createPanel();
  opts = opts || {};

  let node = document.createElement( "div" );
  node.className = "notifier-message " + opts.className || "";

  Utils.parseHTML( `
    <div class='notifier-title'>${title}</div>
    <div class='notifier-body'>${body}</div>
  `, node );

  if( opts.bottom ) panel.appendChild( node );
  else {
    panel.insertBefore( node, panel.firstChild );
  }

  let timer = null;
  let click = function(){
    if( timer ) clearTimeout( timer );
    node.style.opacity=0;
  }
  let expire = function(){
    node.removeEventListener( "transitionend", expire );
    node.addEventListener( "transitionend", cleanup );
    if( opts.timeout !== Infinity )
      timer = setTimeout( function(){ node.style.opacity=0; }, ( opts.timeout || DEFAULT_TIMEOUT ) * 1000 );
  };
  let cleanup = function(){
    node.removeEventListener( "click", click );
    node.removeEventListener( "transitionend", cleanup );
    node.parentNode.removeChild( node );
  }
  node.addEventListener( "click", click );
  node.addEventListener( "transitionend", expire );

  setTimeout( function(){ node.style.opacity=1; }, 1);

};
*/

