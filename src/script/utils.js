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

const PubSub = require( "pubsub-js" );
const fs = require( "fs" );
const path = require( "path" );

let Utils = {};

/**
 * given a block of html, add it to the target node
 * (just set innerHTML), then return a map of all 
 * nodes that have ids.
 * 
 * Optionally use the messages parameter to update 
 * attributes for title and placeholder (...)
 */
Utils.parseHTML = function( content, target, messages ){

  let search = function( node, map ){
    let children = node.children;
    for( let i = 0; i< children.length; i++ ){
      if( children[i].id ) map[children[i].id] = children[i];
      if( messages ){
        ["title", "placeholder"].forEach( function( attr ){
          let matchattr = `data-${attr}-message`;
          if( children[i].hasAttribute( matchattr )){
            let msg = children[i].getAttribute( matchattr );
            children[i].setAttribute( attr, messages[msg] );
          }
        });
        if( children[i].hasAttribute( "data-textcontent-message" )){
            let msg = children[i].getAttribute( "data-textcontent-message" );
            children[i].textContent = messages[msg] ;
        }
      }
      search( children[i], map );
    }
  };

  let nodes = {};
  target.innerHTML = content;
  search( target, nodes );
  return nodes;

};

/**
 * ensure that a stylesheet is attached to the document.
 * loads by reference (i.e. link rel) instead of inlining.
 */
Utils.ensureCSS = function(file, attrs, root){

  root = root || document.head;
  if( typeof root === "string" ) root = document.querySelector( root );
  if( !root ) throw( "invalid root node" );

  let elements = root.querySelectorAll( "link[rel=stylesheet]" );
  let marker = null;

  for( let i = 0; i< elements.length; i++ ){
    let href = elements[i].getAttribute( "href" );
    if( href === file ) return;
    let attr = elements[i].getAttribute( "data-position" );
    if( attr && attr === "last" ) marker = elements[i];
  }

  let link = document.createElement( "link" );
  link.setAttribute( "rel", "stylesheet" );
  if( attrs ){
    Object.keys( attrs ).forEach( function( a ){
      link.setAttribute( a, attrs[a] );
    });
  }
  
  link.setAttribute( "href", file );
  root.insertBefore( link, marker );

};

/**
 * find named node in hierarchical data structure.  intended
 * for munging electron menu templates.
 */
Utils.findNode = function( id, template ){
  if( Array.isArray( template )){
    for( let i = 0; i< template.length; i++ ){
      let obj = Utils.findNode( id, template[i] );
      if( obj ) return obj;
    }
  }
  else if( typeof template === "object" ){
    if( template.id === id ) return template;
    if( template.submenu ){
      let obj = Utils.findNode( id, template.submenu );
      if( obj ) return obj;
    }
  }
  return null;
};

/** for settings, set defaults if there are no values */
Utils.initDefaults = function( target, defaults ){

  if( !defaults || ( typeof defaults !== "object" )) return;
  Object.keys( defaults ).forEach( function( key ){
    if( typeof target[key] === "undefined" ){
      target[key] = defaults[key];
    }
    else Utils.initDefaults( target[key], defaults[key] );
  });

};

/**
 * copy all properties from object -> target where the 
 * value differs.  leave === properties alone.  for objects
 * and arrays, iterate.
 */
Utils.updateDiff = function( target, object ){

  Object.keys( object ).forEach( function( key ){
    let elt = object[key];
    let comp = target[key];

    if( elt === comp ) return; // nothing to do

    if( typeof elt === "object" ){
      if( Array.isArray( elt )){  
        if( !Array.isArray( comp )){
          target[key] = [];
        }
        for( let i = 0; i< elt.length; i++ ){
          if( target[key][i] !== elt[i] ) target[key][i] = elt[i];
        }
      } 
      else { // non-array object
        if( typeof comp !== "object" ){
          target[key] = {};
        }
        Utils.updateDiff( target[key], elt );
      }
    }
    else {
      target[key] = elt;
    }
  });

};

/**
 * utiltity method: dereference field, possibly deep.
 * for arrays, use dot syntax.
 */
Utils.dereference_get = function( root, ref ){
  if( !ref ) return root;
  ref = ref.split( "." );
  while( ref.length ){
    let key = ref.shift();
    if( key ) root = root[ key ];
  }
  return root;
}

/**
 * utiltity method: dereference field, possibly deep.
 * for arrays, use dot syntax.
 */
Utils.dereference_set = function( root, ref, value ){
  if( !ref ) {
    root = value;
    return;
  }
  ref = ref.split( "." );
  while( ref.length > 1 ){
    let key = ref.shift();
    if( key ) root = root[ key ];
  }
  root[ref[0]] = value;
}

Utils.scrubJSON = function( text ){
  text = text.replace( /\/\*.*?\*\//g, "" );
  text = text.replace( /\/\/.*?\n/g, "\n" );
  return text;
};

/**
 * attach functions to a menu template.  this only needs to happen 
 * once (you can change them later if you want).  split from the 
 * updateSettings function, since we may call that more often.
 * 
 * default behavior, which may need to change in some cases:
 * 
 * (1) if the template has a "setting" field, then it will be 
 *     checked based on the truthiness of that setting, and a
 *     click method will be added that updates the setting.
 * 
 * (2) if the template has an "id" field, then a click method
 *     will be added that sends a pubsub message.
 * 
 * update: support different pubsub messages for different contexts
 */
Utils.updateMenu = function( Settings, template, clickMessage ){

  // default for back-compat
  clickMessage = clickMessage || "menu-click";

 if( Array.isArray( template )){
    for( let i = 0; i< template.length; i++ ){
      if( typeof template[i] === "string" ){
        if( template[i] === "separator" ) template[i] = { type: "separator" };
      }
      else Utils.updateMenu( Settings, template[i], clickMessage );
    }
  }
  else if( typeof template === "object" ){
    if( template.submenu ){
      Utils.updateMenu( Settings, template.submenu );
    }
    else {
      if( template.setting ){
        template.click = function(item){
          Utils.dereference_set( Settings, template.setting, template.invert ? !item.checked : item.checked );
        }
      }
      else if( template.id ){
        template.click = function( item, focusedWindow ){
          PubSub.publish( clickMessage, { id: template.id, template: template, item: item, focusedWindow: focusedWindow });
        }
      }
    }
  }
};

/**
 * update settings in a menu template.  sets checkmark according
 * to the settings value.
 */
Utils.updateSettings = function( Settings, template ){
 if( Array.isArray( template )){
    for( let i = 0; i< template.length; i++ ){
      Utils.updateSettings( Settings, template[i] );
    }
  }
  else if( typeof template === "object" ){
    if( template.submenu ){
      Utils.updateSettings( Settings, template.submenu );
    }
    else {
      if( template.setting ){
        let checked = !!Utils.dereference_get( Settings, template.setting );
        template.checked = template.invert ? !checked : checked;
      }
    }
  }
};

/**
 * load the file from the current locale, dev locale, or default.  
 * this runs synchronously so we can do it asap -- could still structure 
 * async, but some other code needs to be refactored.
 * 
 * if the file is malformed, fallback to default and log
 */
Utils.getLocaleResource = function( file, defaultResource ){
  let p, req = eval("require");
  try {
    if( process.env.BERT_INSTALL ){
      p = path.join( process.env.BERT_INSTALL, "locale", "dev", file );
      if( fs.existsSync(p)) return req(p);
      if( process.env.BERT_LOCALE ){
        p = path.join( process.env.BERT_INSTALL, "locale", process.env.BERT_LOCALE, file );
        if( fs.existsSync(p)) return req(p);
      }
    }
  }
  catch( e ){
    console.info( `Error loading locale file (${p}), reverting to default`, e );
  }
  return defaultResource;

};

/**
 * simple string replacement for templated parameter strings
 */
Utils.templateString = function( template ){
  template = template || "";
  let len = arguments.length - 1
  for( let i = len; i > 0; i-- ){
    template = template.replace( new RegExp( "\\$" + i, "g" ), arguments[i] );
  }  
  return template;
};

/**
 * when R gives us a data frame, it's organized by column.  
 * restructure as rows, optionally named.
 */
Utils.restructureDataFrame = function( obj, named ){

  let cols = obj.$names.length;
  let rows = obj.$data[obj.$names[0]].length;
  let arr = new Array(rows);

  if( named ){
    for( let i = 0; i< rows; i++ ){
      arr[i] = {};
      for( let j = 0; j< cols; j++ ){
        let name = obj.$names[j];
        arr[i][name] = obj.$data[name][i];
      }
    }
  }
  else {
    for( let i = 0; i< rows; i++ ){
      arr[i] = [];
      for( let j = 0; j< cols; j++ ){
        let name = obj.$names[j];
        arr[i][j] = obj.$data[name][i];
      }
    }
  }
  return arr;
};

module.exports = Utils;
