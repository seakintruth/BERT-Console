
"use strict";

const PubSub = require( "pubsub-js" );

let Utils = {};

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
 */
Utils.updateMenu = function( Settings, template ){

 if( Array.isArray( template )){
    for( let i = 0; i< template.length; i++ ){
      if( typeof template[i] === "string" ){
        if( template[i] === "separator" ) template[i] = { type: "separator" };
      }
      else Utils.updateMenu( Settings, template[i] );
    }
  }
  else if( typeof template === "object" ){
    if( template.submenu ){
      Utils.updateMenu( Settings, template.submenu );
    }
    else {
      if( template.setting ){
        template.click = function(item){
          Settings[template.setting] = template.invert ? !item.checked : item.checked;
        }
      }
      else if( template.id ){
        template.click = function( item, focusedWindow ){
          PubSub.publish( "menu-click", [ template.id, template, item, focusedWindow ]);
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
        let checked = !!Settings[template.setting];
        template.checked = template.invert ? !checked : checked;
      }
    }
  }
};

module.exports = Utils;
