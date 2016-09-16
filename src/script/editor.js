
"use strict";

require( "../style/editor.css" );

const remote = window.require('electron').remote;
const dialog = remote.dialog;
const Settings = require( "./settings.js" );
const fs = require( 'fs' );
const path = require( 'path' );
const PubSub = require( 'pubsub-js' );
const NodeMap = require( './node-map.js' );
const Utils = require( './utils.js' );
const Menu = remote.Menu;
const Search = require( "./search.js" );

// define this in a usable format, we'll unpack.
// FIXME: external data file

let supportedLanguages = {

  R: { extensions: [ 'r', 'rscript', 'rsrc' ], path: 'r' },
  Javascript: { extensions: [ 'js', 'jscript', 'json' ], path: 'javascript' },
  HTML: { extensions: [ 'htm', 'html' ], path: 'htmlmixed', depends: [ 'xml', 'javascript', 'css' ] },
  CSS: { extensions: [ 'css' ], path: 'css' },
  Markdown: { extensions: [ 'md', 'markdown' ], path: 'markdown' }

};

let languages = {};
Object.keys( supportedLanguages ).forEach( function( language ){
  supportedLanguages[language].extensions.forEach( function( ext ){
    languages[ext] = { language: language, path: supportedLanguages[language].path };
  });
})

const Editor = function(opts){

  if( !opts || !opts.node ) throw( "node required" );

  let active = null;
  let editors = [];
  let tabs = [];

  PubSub.subscribe( "settings-change", function( channel, update ){
    if( update ){
      switch( update.key ){
      case "editor_hide_linenumbers":
        editors.forEach( function( editor ){
          editor.cm.setOption( "lineNumbers", !Settings.editor_hide_linenumbers );
        });
        break;
      case "editor_hide_status_bar":
        document.getElementById( "statusBar" ).style.display = 
          Settings.editor_hide_status_bar ? "none" : "";
        break;
      }
    }
  });

  let activate = function( editor ){

    if( active === editor ) return;
    if( active ){
      active.cm.off( "cursorActivity" );
      active.cm.off( "change" );
      active.cm.off( "focus" );
    }
    active = editor;

    if( !active ) return;

    active.cm.on( "cursorActivity", function(){
      updatePosition();
    });
    active.cm.on( "change", function(){
      markDirty( true );
    });
    active.cm.on( "focus", function(){
      PubSub.publish( "focus-event", "editor" );
    });

    updateStatus();

  };

  let orphans = document.createElement( "div" );
  orphans.className = "orphans";
  document.body.appendChild( orphans );

  // FIXME: this is handy, but webpack is forced to leave
  // it as-is.  better would be to use a file, or let webpack
  // know if can compress whitespace.

  let nodes = NodeMap.parse(`

    <div id='editorPanel' class='editor-panel'>
      <div id='tabBar' class='editor-tab-bar'></div>
      <div id='container' class='editor-container'>
        <div id='contentPanel' class='editor-content-panel'></div>
        <div id='searchPanel' class='editor-search-panel'>
          <label for='find-text'>Find:</label><input type='text' name='find-text' id='find-text'/>
        </div>
      </div>
      <div id='statusBar' class='editor-status-bar'>
        <div class='left'>
          <div class='message' id='status-message'></div>
        </div>
        <div class='right'>
          <div class='position' id='statusPosition'></div>
          <div class='language' id='statusLanguage'></div>
        </div>
      </div>
    </div>

  `, opts.node );

  if( Settings.editor_hide_status_bar ) nodes.statusBar.style.display = "none";

  let markDirty = function( dirty ){
    active.dirty = dirty;
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

//    let mode = active.cm.getOption("mode") || "?";
//    mode = mode[0].toUpperCase() + mode.substr(1).toLowerCase();

    nodes.statusLanguage.textContent = `Language: ${active.language || "?"}`;
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

  this.focus = function(){
    if( active ) active.cm.focus();
  };

  let closeEditor = function(index){

    let tab = tabs[index];
    let editor = editors[index];

    let is_active = tab.classList.contains( "active" );

    if( editor.dirty ){
      let rslt = dialog.showMessageBox({
        type: "question",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        noLink: true,
        message: "Save changes to " +
            (editor.path ? path.basename( editor.path ) : "Untitled") + "?"

      });
      switch( rslt ){
      case 2: // cancel
        return;
      case 0: // save
        save(editor);
      }

    }    

    tab.parentNode.removeChild( tab );
    tabs.splice( index, 1 );

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

  ////////////

  const editorContextMenuTemplate = [
    { 
      label: 'Select All', click: function(){
        active.cm.execCommand('selectAll');
    }},
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { type: 'separator' },
    {
      id: 'execute',
      label: "Execute selected code",
      enabled: false,
      click: function(){
        let code = active.cm.getDoc().getSelection();
        PubSub.publish( "execute-block", code );
      }
    }
  ];

  nodes.contentPanel.addEventListener('contextmenu', function(e){
    e.preventDefault();
    let mode = active.cm.getOption("mode");
    let node = Utils.findNode( "execute", editorContextMenuTemplate );
    if( node ) node.enabled = (mode === 'r' && active.cm.getDoc().somethingSelected());
    Menu.buildFromTemplate( editorContextMenuTemplate ).popup(remote.getCurrentWindow());
  }, false);

  ////////////

  const tabContextMenu = Menu.buildFromTemplate([
    { label: 'Close', 
      click: function(){
        closeEditor( tabContextMenu.targetIndex );
      }
    },
    { label: 'Close Others',
      click: function(){ 
        for( let i = 0; i< tabContextMenu.targetIndex; i++ ) closeEditor( 0 );
        while( editors.length > 1 ) closeEditor( 1 );
      }
    },
    { label: 'Close All', 
      click: function(){
        let count = editors.length;
        for( let i = 0; i< count; i++ ) closeEditor( 0 );
      }
    },
  ]);

  nodes.tabBar.addEventListener( "contextmenu", function( e ){
    e.preventDefault();
    e.stopPropagation();

    if( e.target.className === "editor-tab-bar" ) return;
    let target = e.target;
    if( !target.classList.contains( "tab" )) target = target.parentNode;

    let index = 0;
    for( let i = 0; i< tabs.length; i++ ){
      if( tabs[i] === target ){
        index = i;
        break;
      }
    }

    tabContextMenu.targetIndex = index;
    tabContextMenu.popup(remote.getCurrentWindow());

  });

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

    let language = languages[ext.substr(1).toLowerCase()];
    editor.language = language ? language.language : null;
    if( !language ) return;

    let available = ensureScript( cmmode( language.path ));

    if( language.depends ){
      language.depends.forEach( function( p ){
        available = available && ensureScript( cmmode( p ));
      });
    }

    setTimeout( function(){
      editor.cm.setOption( "mode", language.path );
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
        lineNumbers: !Settings.editor_hide_linenumbers,
        value: options.value || "",
        mode: "",
        // mode: "r", // opts.mode,
        // allowDropFileTypes: opts.drop_files,
        viewportMargin: 50
    });
    options.cm.setOption( "theme", Settings.editor_theme || "default" );
    options.cm.setOption("matchBrackets", true);

    options.cm.setOption("extraKeys", {
      Tab: function(cm) {
        var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces);
      }
    });

    Search.apply( options.cm );

    editors.push(options);
    if( !toll ){
      activate( options );
      updateStatus();
      PubSub.publish( "editor-new-tab" );
    }

    ensureMode(options);

  };

  let updateRecentFiles = function(file){

    // push onto recent files list.  remove other references to the 
    // same file.  we do this so it will move to the top of the list
    // when you open it again.

    let recent = Settings.recent_files || [];
    recent = recent.filter( function(test){ return test !== file });
    recent.push( file );
    Settings.recent_files = recent;

    PubSub.publish( "menu-update" );

  }

  let load = function( file, add, toll ){

    if( !toll ) updateRecentFiles( file );

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

  this.refresh = function(){

    // switching to a new tab calls refresh, so we only need
    // to refresh the active tab 

    /*
    editors.forEach( function( editor ){
      editor.cm.refresh();
    });
    */
    
    active.cm.refresh();
  }

  this.newFile = function(){
    addEditor();
  };

  this.close = function(){

    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === active ){
        closeEditor( i );
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

  let save = function( editor ){

    if( !editor ){
      if( !active ) return;
      editor = active;
    }

    if( !editor.path ) return saveAs(editor);
    else {
      let contents = editor.cm.getValue();
      fs.writeFile( editor.path, contents, { encoding: "utf8" }, function(err){
        if( err ) PubSub.publish( "file-save-error", err );
        else markDirty(false);
      })
    }
  };

  this.updateTheme = function(){
    editors.forEach( function( editor ){
      editor.cm.setOption( "theme", Settings.editor_theme || "default" );
    })
  };

  let saveAs = function(editor){

    if(!editor) editor = active;

    let rslt = dialog.showSaveDialog({
      defaultPath: Settings.openPath,
      filters: [
        {name: 'R files', extensions: ['r', 'rsrc', 'rscript']},
        {name: 'All Files', extensions: ['*']}
      ],
      properties: ['openFile', 'NO_multiSelections']});
    
    if( !rslt ) return false;
    editor.path = rslt;
    updateRecentFiles( editor.path );

    let index = 0;
    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === editor ){
        index = i;
        break;
      }
    }

    tabs[index].querySelector( ".tab-label" ).textContent = path.basename( rslt );
    save(editor);

    let arr = [];
    editors.forEach( function( editor ){
      if( editor.path ) arr.push( editor.path );
    });
    Settings.openFiles = arr;
    ensureMode();

    return true;

  };

  this.save = save;
  this.saveAs = saveAs;

  // --- find and replace ---

  /**
   * display and focus the search panel
   */
  this.find = function(){

    // if( nodes.searchPanel.style.display === "block" ) return;
    nodes.searchPanel.style.display = "block";
    nodes['find-text'].focus();
    search();

  };

  nodes['find-text'].addEventListener( "keydown", function(e){
    e.stopPropagation();
    if( e.key === "Escape" ){
      if( active ) active.cm.focus();
      nodes.searchPanel.style.display = "";

      // remove any search highlights
      active.cm.clearSearch();
    }
  });

  nodes['find-text'].addEventListener( "keyup", function(e){
    search();
  });

  const search = function(){
    
    let text = nodes['find-text'].value;
    // console.info( text );
    
    if (text.length) active.cm.search(text);
    else active.cm.clearSearch();

  }

  // --- /find and replace ---

  // TODO: revert

  this.open = function( file ){

    if( !file ){    
      let rslt = dialog.showOpenDialog({
        defaultPath: Settings.openPath,
        filters: [
          {name: 'R files', extensions: ['r', 'rsrc', 'rscript']},
          {name: 'All Files', extensions: ['*']}
        ],
        properties: ['openFile', 'NO_multiSelections']});
      
      if( !rslt ) return;
      file = rslt[0];
    }

    // if the file is already open, don't open it again.
    // switch to the buffer

    for( let i = 0; i< editors.length; i++ ){
      if( editors[i].path === file ){
        selectTab(i);
        return;
      }
    }

    load( file, true );

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

