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
 * dictionary object with a backing store (localStorage or file) that broadcasts changes.
 */

"use strict";

const fs = require( "fs" );
const path = require( "path" );
const PubSub = require( "pubsub-js" );
const chokidar = window.require('chokidar');

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
	
	let json = localStorage.getItem( key );
	let js = json ? JSON.parse( json ) : {};
	Object.assign( this, js );

};

LocalStorageBase.prototype.save = function(){
	localStorage.setItem( this.__storage_key__, JSON.stringify( this ));
};

/**
 * settings base using a file: the benefit is that 
 * we can edit it.
 */
const FileBase = function(file, options){

  options = options || {};

	if( !file ) throw( "provide a path" );

	Object.defineProperty( this, "__storage_path__", {
		enumerable: false,
		configurable: false,
		value: file
	});

  // we have the option to watch this file.  that creates some issues
  // with saving on property changes, because they will bounce back 
  // and forth.  so we have this property we can use to say "we're in
  // this kind of operation".  when we are reverting from a file, 
  // don't write the properties file.

	Object.defineProperty( this, "__reverting__", {
		enumerable: false,
		configurable: false,
    writable: true, 
		value: false
	});

  // and the other way around: since we save on changes, don't reload
  // when we are setting it.  FIXME: one __state__ property?

  Object.defineProperty( this, "__setting__", {
		enumerable: false,
		configurable: false,
    writable: true,
		value: false
  });

  // NOTE: this reads synchronously.  it's important that we are loaded
  // prior to accessing any settings.  as long as settings is not too 
  // large, this should not be a problem.

  let contents, exists = false;
  try { 
    contents = fs.readFileSync( file, { encoding: "utf8" }) || "";
    exists = true;
  } catch( e ){
    contents = "{}";
  }
  Object.assign( this, JSON.parse( contents ));

  // if the file doesn't exist, try to create it.  this should throw
  // an exception if the path is invalid for some reason (not exist, locked)

  if( !exists ) this.save();

};

FileBase.prototype.save = function(){
  this.__setting__ = true;
  fs.writeFile( this.__storage_path__, JSON.stringify(this, undefined, 2), { encoding: "utf8" }, function(){
    this.__setting__ = false;
  });
};

// this is implemented as a singleton, and can support multiple 
// instances (although there may not be much call for that).

let cache = {};

module.exports = {

  store: function( type, key, options ){

    options = options || {};

    // normalize
    if( type === "file" ){
      if( key && options.home ){
        key = path.join( process.env.USERPROFILE || process.env.HOME, key );
      }
      key = key || path.join( process.env.USERPROFILE || process.env.HOME, "settings.json" );
    } 
    else if( !type || type === "localStorage" ) { 
      type = "localStorage";
      key = key || "settings";
    }
    else throw "invalid base type";

    // check cache
    let compositeKey = type + ":" + key;
    if( cache[compositeKey] ) return cache[compositeKey];

    // create and return
    let base = ( type === "file" ) ? new FileBase( key, options ) : new LocalStorageBase( key, options );
    let Settings = new Proxy( base, {

      set: function(target, property, value, receiver) {

        // console.info( "SET", property, "->", value );

        if( typeof value === "undefined" || null === value ) delete target[property];
        else target[property] = value;

        // save to backing store.  for the file version, we may want to toll 
        // this when reloading; otherwise we'll trigger lots of writes, and probably
        // corrupt the file.

        if( !target.__reverting__ ) target.save();
        // else console.info( "Not saving" );

        // broadcast
        PubSub.publish( "settings-change", { key: property, val: value });

        return true;
      },

        /**
         * NOTE: we're deep-copying here.  why? to prevent accidental update
         * of object values.  There's a case in which you get an object
         * 
         * let x = Settings['x']
         * 
         * and then modify that object,
         * 
         * x.y = 1
         * 
         * which has the effect of calling set() on the Settings object because
         * it's a reference.  while that might be useful behavior, it's unintuitive
         * and different from non-object behavior.  therefore we use copies.
         */
      get: function(target, property, receiver) {
            let rslt = target[property];
            if( typeof rslt === "object"){
                // cheaper way?
                rslt = JSON.parse( JSON.stringify( rslt ));
            }
            return rslt;
      }

    });

    if( type === "file" && options.watch ){
      
      // optionally watch the file for changes; on external change, reload
      // and notify.  FIXME: should we notify properties individually?

      chokidar.watch( key ).on('change', (event, path) => {

        if( base.__setting__ ) return;
        fs.readFile( key, { encoding: "utf8" }, function( err, contents ){
          if( err ) throw( "read settings file failed");
          let js = JSON.parse( contents );
          base.__reverting__ = true;
          Object.assign( Settings, js );
          base.__reverting__ = false;
        });
      });

    }

    cache[compositeKey] = Settings;
    return cache[compositeKey];

  }

};

