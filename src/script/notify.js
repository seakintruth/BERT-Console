
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

