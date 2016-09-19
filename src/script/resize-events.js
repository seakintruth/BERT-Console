
"use strict";

const PubSub = require( "pubsub-js" );

/** delay in ms */
const delay = 500;

let timerID = null;

window.addEventListener( "resize", function( resize ){
  if( timerID ) clearTimeout( timerID );
  timerID = setTimeout( function(){
    timerID = null;
    PubSub.publish( "window-resize" );
  }, delay );
});

