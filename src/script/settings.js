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

/**
 * dictionary object with a backing store (localStorage or file) that 
 * broadcasts changes. supports deep structure.
 */

"use strict";

const fs = require( "fs" );
const path = require( "path" );
const PubSub = require( "pubsub-js" );
const chokidar = window.require('chokidar');
const Utils = require( "./utils.js" );

// === storage bases ==========================================================

// storage bases need to provide save() and restore() methods,
// and implement a __restoring__ property which is set within 
// that restore method.  we should probably stick all that stuff 
// into a base class.

// --- localStorage -----------------------------------------------------------

/**
 * settings base using LocalStorage
 */
const LocalStorageBase = function(key){
	
	if( !key ) throw( "provide a key for localStorage" );

	Object.defineProperty( this, "__storage_key__", {
		enumerable: false,
		configurable: false,
		value: key
	});
	
	Object.defineProperty( this, "__reverting__", {
		enumerable: false,
		configurable: false,
    writable: true, 
		value: false
	});

};

LocalStorageBase.prototype.save = function(){
	localStorage.setItem( this.__storage_key__, JSON.stringify( this ));
};

LocalStorageBase.prototype.restore = function(){

  this.__reverting__ = true;

	let json = localStorage.getItem( this.__storage_key__ );
	let js = json ? JSON.parse( json ) : {};
	Object.assign( this, js );

  this.__reverting__ = false;

};

// --- file -------------------------------------------------------------------

/**
 * settings base using a file: the benefit is that 
 * we can edit it externally.
 */
const FileBase = function(file, options){

  options = options || {};

	if( !file ) throw( "provide a path" );

	Object.defineProperty( this, "__storage_path__", {
		enumerable: false,
		configurable: false,
		value: file
	});

  // flag: when we are reverting from a file, don't write
  // back to the file.

	Object.defineProperty( this, "__reverting__", {
		enumerable: false,
		configurable: false,
    writable: true, 
		value: false
	});

  // and the other way around: since we save on changes, don't 
  // reload when we are setting it.  FIXME: one __state__ property?

  Object.defineProperty( this, "__setting__", {
		enumerable: false,
		configurable: false,
    writable: true,
		value: false
  });

};

FileBase.prototype.save = function(){
  let instance = this;
  instance.__setting__ = true;
  fs.writeFile( this.__storage_path__, JSON.stringify(this, undefined, 2), { encoding: "utf8" }, function(){
    instance.__setting__ = false;
  });
};

FileBase.prototype.restore = function(){

  this.__reverting__ = true;

  // NOTE: this reads synchronously.  it's important that we are loaded
  // prior to accessing any settings.  as long as settings is not too 
  // large, this should not be a problem.

  let contents, exists = false;
  try { 
    contents = fs.readFileSync( this.__storage_path__, { encoding: "utf8" }) || "";
    exists = true;
  } catch( e ){
    contents = "{}";
  }
  Object.assign( this, JSON.parse( Utils.scrubJSON( contents ) ));

  // if the file doesn't exist, try to create it.  this should throw
  // an exception if the path is invalid for some reason (not exist, locked)

  if( !exists ) this.save();

  this.__reverting__ = false;

};

// === settings implementation ================================================

const chainProxy = function( property, value, update, root, path ){

  // it's turtles all the way down
  if( Array.isArray(value)){
    for( let i = 0; i< value.length; i++ ){
      if( value[i] && typeof value[i] === "object" ) value[i] = chainProxy( i, value[i], update, root, [path,i].join('.'));
    }
  }
  else {
    Object.keys(value).forEach( function(i){
      if( value[i] && typeof value[i] === "object" ) value[i] = chainProxy( i, value[i], update, root, [path,i].join('.'));
    });
  }

  return new Proxy( value, {
    set: function( subtarget, subproperty, subvalue ) {
      if( subvalue && typeof subvalue === "object" ){
        subtarget[subproperty] = chainProxy( subproperty, subvalue, update, root, [path,subproperty].join('.'));
      }
      else if( typeof subvalue === "undefined" || null === subvalue ) delete subtarget[subproperty];
      else subtarget[subproperty] = subvalue;
      update( root, [path,subproperty].join('.'), value );
      return true;
    }
  });

};

// this is implemented as a factory. to share settings instances across 
// modules, create it somewhere (early) and stick it in the global object.

module.exports = {

  createStore: function( options ){

    options = options || {};
    options.type = options.type || "localStorage";
    
    // set explicitly, leave undefined for default, or set null for no events.
    if( typeof options.event === "undefined" ) options.event = "settings-change";

    // normalize
    if( options.type === "file" ){
      if( options.key && options.home ){
        options.key = path.join( process.env.USERPROFILE || process.env.HOME, options.key );
      }
      options.key = options.key || path.join( process.env.USERPROFILE || process.env.HOME, "settings.json" );
    } 
    else if( options.type === "localStorage" ) { 
      options.key = options.key || "settings";
    }
    else throw "invalid base type";

    // create the base store
    let base = ( options.type === "file" ) ? new FileBase( options.key, options ) : new LocalStorageBase( options.key, options );

    // update method is passed to children    
    let update = function( target, property, value ){

      // save to backing store.  for the file version, we may want to toll 
      // this when reloading; otherwise we'll trigger lots of writes, and probably
      // corrupt the file.

      if( !target.__reverting__ ) target.save();

      // broadcast (optionally)
      //if( options.event ) PubSub.publish( options.event, { key: property, val: value });
      if( options.event ) PubSub.publish( options.event, { key: property, val: Utils.dereference_get( target, property ), store: options.name });

    }

    // create the main proxy
    let Settings = new Proxy( base, {

      set: function(target, property, value, receiver) {

        // remember that typeof null === "object"  
        if( value && typeof value === "object" ){
          target[property] = chainProxy( property, value, update, target, property);
        }
        else if( typeof value === "undefined" || null === value ) delete target[property];
        else target[property] = value;
        update( target, property, value );
        return true;
      }

    });

    Settings.restore();

    if( options.defaults ){
      Utils.initDefaults( Settings, options.defaults );
    }

    if( options.type === "file" && options.watch ){
      
      // optionally watch the file for changes; on external change, reload
      // and notify.  FIXME: should we notify properties individually?

      chokidar.watch( options.key ).on('change', (event, path) => {

        // don't do this if we are programatically changing
        if( base.__setting__ ) return;

        fs.readFile( options.key, { encoding: "utf8" }, function( err, contents ){
          if( err ) throw( "read settings file failed");
          let js = JSON.parse( Utils.scrubJSON( contents ));
          base.__reverting__ = true;
          //Object.assign( Settings, js );
          Utils.updateDiff( Settings, js );
          base.__reverting__ = false;

        });
      });

    }

    return Settings;

  }

};

