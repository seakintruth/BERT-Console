
"use strict";

require( "../style/editor.css" );

const remote = window.require('electron').remote;
const dialog = remote.dialog;
const Settings = require( "./settings.js" );
const fs = require( 'fs' );
const path = require( 'path' );
const PubSub = require( 'pubsub-js' );
const NodeMap = require( './node-map.js' );

const Editor = function(opts){

  if( !opts || !opts.node ) throw( "node required" );

  let active = null;
  let editors = [];
  let tabs = [];

  let activate = function( editor ){

    if( active === editor ) return;
    if( active ){
      active.cm.off( "cursorActivity" );
      active.cm.off( "change" );
    }
    active = editor;

    if( !active ) return;

    active.cm.on( "cursorActivity", function(){
      updatePosition();
    })
    active.cm.on( "change", function(){
      markDirty( true );
    });

    updateStatus();

  };

  let orphans = document.createElement( "div" );
  orphans.className = "orphans";
  document.body.appendChild( orphans );

  let nodes = NodeMap.parse(`

    <div id='editorPanel' class='editor-panel'>
      <div id='tabBar' class='editor-tab-bar'></div>
      <div id='contentPanel' class='editor-content-panel'></div>
      <div id='statusBar' class='editor-status-bar'>
        <div class='left'></div>
        <div class='right'>
          <div class='position' id='statusPosition'></div>
          <div class='language' id='statusLanguage'></div>
        </div>
      </div>
    </div>

  `, opts.node );

  let markDirty = function( dirty ){
    active.dirty = true;
    let index = 0;
    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === active ){
        index = i;
        break;
      }
    }
    if( dirty ) tabs[index].classList.add( "dirty" );
    else tabs[index].classList.remove( "dirty" );
  };

  let updatePosition = function(){
    let pos = active.cm.getDoc().getCursor();
    nodes.statusPosition.textContent = `Line ${pos.line+1}, Col ${pos.ch+1}`;
  };

  let updateStatus = function(){
    if( !active ) return;
    let mode = active.cm.getOption("mode") || "?";
    nodes.statusLanguage.textContent = `Language: ${mode}`;
    updatePosition();
  };

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
    
    //active = editors[index];
    activate( editors[index] );

    nodes.contentPanel.appendChild( active.node );
    active.node.scrollTop = active.scrollTop || 0;
    active.node.scrollLeft = active.crollLeft || 0;

    active.cm.refresh();
    active.cm.focus();

  };

  let closeEditor = function(index){

    let tab = tabs[index];
    let is_active = tab.classList.contains( "active" );

    tab.parentNode.removeChild( tab );
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
      activate( null );
      if( tabs.length === 0 ) addEditor();
      else {
        selectTab( Math.max( 0, index-1 ));
      }
    }

  };

  nodes.tabBar.addEventListener( "click", function( e ){

    e.preventDefault();
    e.stopPropagation();

    if( e.target.className === "editor-tab-bar" ) return;

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
      closeEditor( index );
      return;
    }

    if( is_active ) return;

    selectTab( index );

  });

  let scriptCache = {};

  let cmmode = function( language ){
    return `dist/codemirror/mode/${language}/${language}.js`;
  };

  /**
   * ensure that a script is in the document, adding if 
   * necessary.  because this is a non-immediate operation,
   * we want to know if it's available or if we shoudl wait.
   * 
   * FIXME: is there a load event?
   */
  let ensureScript = function(script){
    if( scriptCache[script] ){
      return true;
    } 
    let arr = document.body.querySelectorAll( "script" );
    for( let i = 0; i< arr.length; i++ ){
      let test = arr[i].getAttribute("src");
      scriptCache[test] = true;
      if( test === script ){
        return true;
      }
    }
    console.info( "adding", script );
    let node = document.createElement( "script" );
    node.setAttribute( "src", script );
    document.body.appendChild( node );
    scriptCache[script] = true;
    return false;
  };

  let ensureMode = function( editor ){

    editor = editor || active;

    if(!editor || !editor.path) return;
    let ext = path.extname( editor.path );
    if( !ext || ext.length < 2 ) return;
    let mode;

    switch( ext.substr( 1 ).toLowerCase()){
    case 'r':
    case 'rsrc':
    case 'rscript':
      mode = 'r';
      break;
    case 'md':
      mode = 'markdown';
      break;
    case 'js':
    case 'json':
      mode = 'javascript';
      break;
    case 'css':
      mode = 'css';
      break;
    default: 
      console.info( "UNHANDLED", ext );
      return;
    };

    let available = ensureScript( cmmode(mode));

    setTimeout( function(){
      editor.cm.setOption( "mode", mode );
      updateStatus();
    }, available ? 1 : 500 );

  };

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
    nodes.tabBar.appendChild( tab );

    editors.forEach( function( editor ){
      orphans.appendChild( editor.node );
    });

    options.node = document.createElement( "div" );
    options.node.className = "editor-content-pane active";

    if( toll ) orphans.appendChild( options.node );
    else nodes.contentPanel.appendChild( options.node );

    options.cm =  CodeMirror( function(elt){
      options.node.appendChild( elt );
      }, { 
        lineNumbers: true,
        value: options.value || "",
        mode: "",
        // mode: "r", // opts.mode,
        // allowDropFileTypes: opts.drop_files,
        viewportMargin: 50
    });

    options.cm.setOption("extraKeys", {
      Tab: function(cm) {
        var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces);
      }
    });

    editors.push(options);
    if( !toll ){
      activate( options );
      updateStatus();
    }

    ensureMode(options);

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

  this.close = function(){

    let index = 0;
    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === active ){
        closeEditor( index );
        return;
      }
    }
  };

  this.selectEditor = function(opts){

    let index = 0;

    if( opts.delta ){
      for( let i = 0; i< editors.length; i++ ){
        if( active === editors[i] ){
          index = i;
          break;
        }
      }
      index += opts.delta;
      if( index < 0 ) index += editors.length;
      if( index >= editors.length ) index -= editors.length;
    }
    else if( typeof opts.index !== "undefined" ) index = opts.index;
    else return;
    
    selectTab(index);

  };

  this.save = function(){
    if( !active ) return;
    if( !active.path ) return this.saveAs();
    else {
      let contents = active.cm.getValue();
      fs.writeFile( active.path, contents, { encoding: "utf8" }, function(err){
        if( err ) PubSub.publish( "file-save-error", err );
        else markDirty(false);
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
    ensureMode();

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

