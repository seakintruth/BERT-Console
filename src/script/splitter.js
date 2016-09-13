/**
 * simple two-pane splitter (horizontal or vertical).
 */

"use strict";

require( "../style/splitter.css" );
const PubSub = require( "pubsub-js" );

let mouseCapture = undefined;

const mousedown = function(event){

  mouseCapture.classList.add("active");
  this.mouseTarget.classList.add( "active" );

  // for whatever reason, background transitions don't work
  // if we also change the display.  so break into two.
  
  setTimeout( function(){
    mouseCapture.classList.add("shaded");
  }, 1 );

  if( this.vertical ){
    mouseCapture.style.cursor = "ns-resize";
  }
  else {
    mouseCapture.style.cursor = "ew-resize";
  }

  let originalSize = this.size.slice(0);

  let drag = function(event){

    let size, field;

    if( this.vertical ){
      size = Math.round( 1000 * event.offsetY / this.node.offsetHeight ) / 10;
      field = "height";
    }
    else {
      size = Math.round( 1000 * event.offsetX / this.node.offsetWidth ) / 10;
      field = "width";
    }

    if( Math.abs(this.size[0] - size) >= Splitter.prototype.MINIMUM_STEP ){
      this.size[0] = size;
      this.size[1] = 100-size;
      this.panes[0].style[field] = this.size[0] + "%";
      this.panes[1].style[field] = this.size[1] + "%";
    }

  }.bind(this);

  let finish = function(){

    mouseCapture.removeEventListener( "mousemove", drag );
    mouseCapture.removeEventListener( "mouseleave", finish );
    mouseCapture.removeEventListener( "mouseup", finish );
    mouseCapture.classList.remove("active");
    mouseCapture.classList.remove("shaded");
    if( originalSize[0] !== this.size[0] ) PubSub.publish( "splitter-resize", this );

    this.mouseTarget.classList.remove( "active" );

  }.bind( this );

  mouseCapture.addEventListener( "mousemove", drag );
  mouseCapture.addEventListener( "mouseleave", finish );
  mouseCapture.addEventListener( "mouseup", finish );

};

/**
 * constructor. opts:
 * {
 *   node: container node,
 *   direction: "VERTICAL" | "HORIZONTAL",
 *   size: [left, right] 
 * }
 */
const Splitter = function( opts ){

  if( !opts || !opts.node ) throw( "node required (missing)" );
  if( typeof opts.node === "string" ){
    opts.node = document.querySelector( opts.node );
    if( !opts.node ) throw( "node required (invalid selector)" );
  }
  this.vertical = ( opts.direction === Splitter.prototype.Direction.VERTICAL );

  this.node = document.createElement( "div" );
  this.node.classList.add("split-panel");
  if( this.vertical ) this.node.classList.add( "vertical" );
  opts.node.appendChild( this.node );

  this.panes = [ document.createElement("div"), document.createElement("div") ];
  this.panes[0].className = "split-pane";
  this.panes[1].className = "split-pane";
  this.size = [50,50];

  if( Array.isArray( opts.size )){
    this.size = opts.size.slice(0);
    this.size[0] = this.size[0] || 0;
    this.size[1] = this.size[1] || 0;
    let sum = this.size[0] + this.size[1];
    this.size[0] = Math.round( 1000 * this.size[0] / sum ) / 10;
    this.size[1] = Math.round( 1000 * this.size[1] / sum ) / 10;
  }

  let field = this.vertical ? "height" : "width";

  this.panes[0].style[field] = this.size[0] + "%";
  this.panes[1].style[field] = this.size[1] + "%";

  this.splitter = document.createElement( "div" );
  this.splitter.className = "splitter";

  this.mouseTarget = document.createElement( "div" );
  this.mouseTarget.className = "mouse-target";
  this.mouseTarget.addEventListener( "mousedown", mousedown.bind(this));
  this.splitter.appendChild( this.mouseTarget );

  this.node.appendChild( this.panes[0] );
  this.node.appendChild( this.splitter );
  this.node.appendChild( this.panes[1] );

  if( !mouseCapture ){
    mouseCapture = document.createElement( "div" );
    mouseCapture.className = "splitter-mouse-capture";
    document.body.appendChild( mouseCapture );
  }

};

/** const enum: splitter direction (horizontal is the default) */
Splitter.prototype.Direction = { 
  VERTICAL: "VERTICAL",
  HORIZONTAL: "HORIZONTAL"
};

/** 
 * const: minimum drag step (in %) to reduce unecessary resizing.
 * because we round sizes to 0.1, that's the effective minumum.
 */
Splitter.prototype.MINIMUM_STEP = .5;

module.exports = Splitter;
