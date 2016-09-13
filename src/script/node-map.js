
"use strict";

let search = function( node, map ){
  let children = node.children;
  for( let i = 0; i< children.length; i++ ){
    if( children[i].id ) map[children[i].id] = children[i];
    search( children[i], map );
  }
};

module.exports = {
  parse: function( content, target ){
    let nodes = {};
    target.innerHTML = content;
    search( target, nodes );
    return nodes;
  }
};
