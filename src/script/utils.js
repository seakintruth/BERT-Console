
"use strict";

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

module.exports = Utils;
