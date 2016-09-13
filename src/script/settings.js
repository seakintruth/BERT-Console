
/**
 * dictionary object with a backing store (currently localStorage, 
 * but should be pluggable) that broadcasts changes.
 */

"use strict";

const PubSub = require( "pubsub-js" );

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
}

const Settings = new Proxy( new LocalStorageBase( "settings" ), {

	set: function(target, property, value, receiver) {

		if( typeof value === "undefined" || null === value ) delete target[property];
		else target[property] = value;

		// save to backing store
		target.save();

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

module.exports = Settings;

