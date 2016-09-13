
"use strict";

require( "../style/editor.css" );

const remote = window.require('electron').remote;
const dialog = remote.dialog;
const Settings = require( "./settings.js" );
const fs = require( 'fs' );
const path = require( 'path' );
const PubSub = require( 'pubsub-js' );

const Editor = function(opts){

  if( !opts || !opts.node ) throw( "node required" );

  let active = null;
  let editors = [];
  let tabs = [];

  let orphans = document.createElement( "div" );
  orphans.className = "orphans";
  document.body.appendChild( orphans );

  let editorPanel = document.createElement( "div" );
  editorPanel.className = "editor-panel";
  opts.node.appendChild( editorPanel );

  let tabBar = document.createElement( "div" );
  tabBar.className = "editor-tab-bar";
  editorPanel.appendChild( tabBar );

  let selectTab = function( index ){

    tabs.forEach( function( tab, i ){ 
      if( i === index ) tab.classList.add( "active" )
      else tab.classList.remove( "active" )
    });

    if( active ){
      active.scrollTop = active.node.scrollTop;
      active.scrollLeft = active.node.scrollLeft;
      orphans.appendChild( active.node );
    }
    active = editors[index];

    contentPanel.appendChild( active.node );
    active.node.scrollTop = active.scrollTop || 0;
    active.node.scrollLeft = active.crollLeft || 0;

    active.cm.refresh();
    active.cm.focus();

  };

  tabBar.addEventListener( "click", function( e ){

    e.preventDefault();
    e.stopPropagation();

    let target = e.target;
    let index = 0;
    let close = false;
    let is_active = false;

    if( target.className === "tab-x" ){
      close = true;
      target = target.parentNode;
    }
    else if( target.className === "tab-label" ){
      target = target.parentNode;
    }

    for( let i = 0; i< tabs.length; i++ ){
      if( tabs[i] === target ){
        index = i;
        break;
      }
    }

    is_active = target.classList.contains( "active" );

    if( close ){
      target.parentNode.removeChild( target );
      tabs.splice( index, 1 );
      let editor = editors[index];
      if( editor.path ){
        let tmp = Settings.openFiles.filter(function(file){
          return file !== editor.path;
        });
        Settings.openFiles = tmp;
      }
      editor.node.parentNode.removeChild( editor.node );
      editors.splice( index, 1 );
      if( is_active ){
        active = null;
        if( tabs.length === 0 ) addEditor()
        else {
          selectTab( Math.max( 0, index-1 ));
        }
      }
      return;
    }

    if( is_active ) return;

    selectTab( index );

  });

  let contentPanel = document.createElement( "div" );
  contentPanel.className = "editor-content-panel";
  editorPanel.appendChild( contentPanel );

  let addEditor = function( options, toll ){

    options = options || {};

    let tab = document.createElement("div");
    tab.className = toll ? "tab": "tab active";
    let label = document.createElement( "span" );
    label.className = "tab-label";
    label.textContent = options.path ? path.basename( options.path ) : "Untitled";
    tab.appendChild( label );
    let X = document.createElement( "span" );
    X.className = "tab-x";
    tab.appendChild( X );

    tabs.forEach( function( other ){
      other.classList.remove( "active" );
    });
    
    tabs.push( tab );
    tabBar.appendChild( tab );

    editors.forEach( function( editor ){
      orphans.appendChild( editor.node );
    });

    options.node = document.createElement( "div" );
    options.node.className = "editor-content-pane active";

    if( toll ) orphans.appendChild( options.node );
    else contentPanel.appendChild( options.node );

    options.cm =  CodeMirror( function(elt){
      options.node.appendChild( elt );
      }, { 
        lineNumbers: true,
        value: options.value || "",
        mode: "r", // opts.mode,
        // allowDropFileTypes: opts.drop_files,
        viewportMargin: 50
    });

    editors.push(options);
    active = options;

  };

  let load = function( file, add, toll ){
    return new Promise( function( resolve, reject ){
      fs.readFile( file, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          PubSub.publish( "file-open-error", err );
        }
        else {
          addEditor({ path: file, value: contents, node: opts.node }, toll);
          if( add ){
            // settings doesn't handle arrays
            let arr = Settings.openFiles || [];
            arr.push( file );
            Settings.openFiles = arr;
          }
        }
        resolve();
      });
    });
  };

  this.newFile = function(){
    addEditor();
  };

  this.save = function(){
    if( !active ) return;
    if( !active.path ) return this.saveAs();
    else {
      let contents = active.cm.getValue();
      fs.writeFile( active.path, contents, { encoding: "utf8" }, function(err){
        if( err ) PubSub.publish( "file-save-error", err );
      })
    }
  };

  this.saveAs = function(){

    let rslt = dialog.showSaveDialog({
      defaultPath: Settings.openPath,
      filters: [
        {name: 'R files', extensions: ['r', 'rsrc', 'rscript']},
        {name: 'All Files', extensions: ['*']}
      ],
      properties: ['openFile', 'NO_multiSelections']});
    
    if( !rslt ) return;
    active.path = rslt;

    let index = 0;
    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === active ){
        index = i;
        break;
      }
    }

    tabs[index].querySelector( ".tab-label" ).textContent = path.basename( rslt );
    this.save();

    let arr = [];
    editors.forEach( function( editor ){
      if( editor.path ) arr.push( editor.path );
    });
    Settings.openFiles = arr;

  };

  this.open = function(){
    
    let rslt = dialog.showOpenDialog({
      defaultPath: Settings.openPath,
      filters: [
        {name: 'R files', extensions: ['r', 'rsrc', 'rscript']},
        {name: 'All Files', extensions: ['*']}
      ],
      properties: ['openFile', 'NO_multiSelections']});
    
    if( !rslt ) return;
    load( rslt[0], true );

  };

  let loadFiles = function(arr){
    return new Promise( function( resolve, reject ){
      if( !arr.length ) return resolve();
      let path = arr.shift();
      load( path, false, true ).then( function(){
        return loadFiles(arr);
      }).then( function(){
        resolve();
      });
    });
  }

  // load previously open files
  if( Settings.openFiles && Settings.openFiles.length ){
    loadFiles( Settings.openFiles.slice(0)).then( function(){
      selectTab( tabs.length - 1 );
    });
  }
  else addEditor();

};

module.exports = Editor;

