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

require( "../style/editor.css" );

const chokidar = window.require('chokidar');

// some default settings in the global settings object

const Utils = require( './utils.js' );
Utils.initDefaults( Settings, {
  editor: {
    CodeMirror: {
      lineNumbers: true,
      matchBrackets: true
    },
    statusBar: true
  }
});

// separate settings object for MRU and open files; this one is in 
// localStorage.  it's expressly not put int global storage, just 
// available in this module.

let FileSettings = require( "./settings.js" ).createStore({ 
  name: "file", type: "localStorage", key: "file-settings", event: null });

const remote = window.require('electron').remote;
const dialog = remote.dialog;
const fs = require( 'fs' );
const path = require( 'path' );
const PubSub = require( 'pubsub-js' );
const Menu = remote.Menu;
const Search = require( "./search.js" );

const htmlTemplate = require( "../data/editor.template.html" );

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

// --- editor class ---------------------------------------

const Editor = function(opts){

  if( !opts || !opts.node ) throw( "node required" );

  let active = null;
  let editors = [];
  let tabs = [];

  PubSub.subscribe( "settings-change", function( channel, update ){

    if( update ){
      let m = update.key.match( /^editor\.CodeMirror\.(.*?)$/ );
      if( m ){
        console.info( "UPDATE", m[1], update.val );
        editors.forEach( function( editor ){
          editor.cm.setOption( m[1], update.val );
        })
      }
      else {
        switch( update.key ){
          /*
        case "editor.line_numbers":
          editors.forEach( function( editor ){
            editor.cm.setOption( "lineNumbers", Settings.editor.line_numbers );
          });
          break;
          */
        case "editor.statusBar":
          document.getElementById( "statusBar" ).style.display = 
            Settings.editor.statusBar ? "" : "none";
          break;
        }
      }
    }
  });

  // we're required to pass the functions back to off()

  let change_handler = function(){
    markDirty( true );
  };

  let focus_handler = function(){
    PubSub.publish( "focus-event", "editor" );
  };

  let cursorActivity_handler = function(){
    updatePosition();
  };

  /**
   * activate an editor.  this function unifies the event registration,
   * don't monkey with events anywhere else
   */
  let activate = function( editor ){

    if( active === editor ) return;
    if( active ){

      // disable events -- requires the functions again

      active.cm.off( "change", change_handler );
      active.cm.off( "focus", focus_handler );
      active.cm.off( "cursorActivity", cursorActivity_handler );

    }
    active = editor;

    // you can pass null just to turn off events

    if( !active ) return;

    if( findActive ) search(true);
    else active.cm.find.clear();

    // monitor events

    active.cm.on( "change", change_handler );
    active.cm.on( "focus", focus_handler );
    active.cm.on( "cursorActivity", cursorActivity_handler );

    updateStatus();

  };

  // create a holder for un-laid-out content
  
  let orphans = document.createElement( "div" );
  orphans.className = "orphans";
  document.body.appendChild( orphans );

  // load external html; insert it into the target
  // and get a reference to named entities.
  
  let nodes = Utils.parseHTML( htmlTemplate, opts.node );

  if( !Settings.editor.statusBar ) nodes.statusBar.style.display = "none";

  /**
   * mark as dirty (or clean)
   */
  let markDirty = function( dirty, editor ){
    if( !editor ) editor = active;

    editor.dirty = dirty;
    let index = 0;
    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === editor ){
        index = i;
        break;
      }
    }
    if( dirty ) tabs[index].classList.add( "dirty" );
    else tabs[index].classList.remove( "dirty" );
  };

  /**
   * update cursor position on the status bar 
   */
  let updatePosition = function(){
    let pos = active.cm.getDoc().getCursor();
    nodes.statusPosition.textContent = `Line ${pos.line+1}, Col ${pos.ch+1}`;
  };

  /**
   * update language and position on the status bar
   */
  let updateStatus = function(){
    if( !active ) return;
    nodes.statusLanguage.textContent = `Language: ${active.language || "?"}`;
    updatePosition();
  };

  /** 
   * select a tab by index
   */
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

    FileSettings.activeTab = index;

  };

  this.focus = function(){
    if( active ) active.cm.focus();
  };

  let querySave = function( editor ){

    if( editor.dirty ){
      let rslt = dialog.showMessageBox({
        type: "question",
        buttons: ["Save", "Don't Save", "Cancel"],
        defaultId: 0,
        noLink: true,
        message: "Save changes to " +
            (editor.path ? path.basename( editor.path ) : editor.alternateName) + "?"

      });
      switch( rslt ){
      case 2: // cancel
        return "cancel";
      case 0: // save
        save(editor);
        return "saved";
      }

    }    
    return "not saved"; // don't save

  }

  let closeEditor = function(index){

    let tab = tabs[index];
    let editor = editors[index];

    let is_active = tab.classList.contains( "active" );

    if( "cancel" === querySave( editor )) return;

    tab.parentNode.removeChild( tab );
    tabs.splice( index, 1 );

    if( editor.path ){
      let tmp = FileSettings.openFiles.filter(function(file){
        return file !== editor.path;
      });
      FileSettings.openFiles = tmp;
    }

    if( editor.path ) unwatchFile( editor.path );

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

  // --- file watching --------------------------------------

  let watcher = null;
  let ignoreChanges = null;

  let fileChanged = function( file ){

    // we saved it
    if( file === ignoreChanges ) return;

    editors.forEach( function( editor, index ){
      if( editor.path === file ){
        if( !editor.dirty ) revert( editor );
      }
    });

  };

  let watchFile = function( path ){

    if( !watcher ){
      watcher = chokidar.watch( path, { persistent: true });
      watcher.on( 'change', fileChanged );
    }
    else {
      watcher.add( path );
    }

  };

  let unwatchFile = function( path ){
    watcher.unwatch( path );
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
    return `codemirror/mode/${language}/${language}.js`;
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

  /** 
   * ensure that we have a mode file.  if not, add it to 
   * the document and delay updating the markup.
   */
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

  /**
   * get a name so we have ascending utitled-1, untitled-2, &c. 
   * essentially we want these to increment monotonically, starting
   * from 1, with the exception that if there is one hanging around
   * like Untitled-5, the next one will be -6 EVEN THOUGH there are 
   * no numbers 1-4.
   */
  let getAlternateName = function(){

    // FIXME: parameterize
    let baseName = "Untitled";

    let max = 0;
    editors.forEach( function( editor ){
      if( editor.path ) return;
      let m = editor.alternateName.match( /-(\d+)$/ );
      if( m ){
        max = Math.max( max, Number( m[1] ));
      }
    });

    return baseName + "-" + (max+1);

  };

  /**
   * create a new editor (buffer) and add it to the window.
   */
  let addEditor = function( options, toll ){

    let editor = options || {};

    let tab = document.createElement("div");
    tab.className = toll ? "tab": "tab active";

    let label = document.createElement( "span" );
    label.className = "tab-label";
    if( !editor.path ) editor.alternateName = getAlternateName();
    label.textContent = editor.path ? path.basename( editor.path ) : editor.alternateName;
    tab.appendChild( label );
    
    let X = document.createElement( "span" );
    X.className = "tab-x";
    tab.appendChild( X );

    tabs.forEach( function( other ){
      other.classList.remove( "active" );
    });
    
    tabs.push( tab );
    nodes.tabBar.appendChild( tab );

    editors.forEach( function( elt ){
      orphans.appendChild( elt.node );
    });

    editor.node = document.createElement( "div" );
    editor.node.className = "editor-content-pane active";

    if( toll ) orphans.appendChild( editor.node );
    else nodes.contentPanel.appendChild( editor.node );

    editor.cm =  CodeMirror( function(elt){
      editor.node.appendChild( elt );
      }, { 
        // lineNumbers: Settings.editor.line_numbers,
        value: editor.value || "",
        mode: "", // mode gets handled later
        // allowDropFileTypes: opts.drop_files,
        viewportMargin: 50
    });
    editor.cm.setOption( "theme", Settings.editor.theme || "default" );

    if( Settings.editor.CodeMirror ){
      Object.keys( Settings.editor.CodeMirror ).forEach( function( key ){
        editor.cm.setOption(key, Settings.editor.CodeMirror[key]);
      });
    }

    editor.cm.setOption("extraKeys", {
      Esc: function(cm){
        if( findActive ) closeSearch();
      },
      Tab: function(cm) {
        var spaces = Array(cm.getOption("indentUnit") + 1).join(" ");
        cm.replaceSelection(spaces);
      },
      "Shift-F3": function(cm){
        if( findActive ){
          cm.find.next(true);
        }
      },
      F3: function(cm){
        if( findActive ){
          cm.find.next();
        }
      }
    });

    Search.apply( editor.cm );

    editors.push(editor);
    if( !toll ){
      activate( editor );
      updateStatus();
      PubSub.publish( "editor-new-tab" );
      FileSettings.activeTab = tabs.length - 1;
    }

    ensureMode(editor);

  };

  this.getRecentFiles = function(){
    return FileSettings.recent_files || [];
  };

  let updateRecentFiles = function(file){

    // push onto recent files list.  remove other references to the 
    // same file.  we do this so it will move to the top of the list
    // when you open it again.

    let recent = FileSettings.recent_files || [];
    recent = recent.filter( function(test){ return test !== file });
    recent.push( file );
    FileSettings.recent_files = recent;

    PubSub.publish( "menu-update" );

  }

  let load = function( file, add, toll ){

    if( !toll ) updateRecentFiles( file );

    return new Promise( function( resolve, reject ){
      fs.readFile( file, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          PubSub.publish( "file-open-error", err );

          // remove from recent files? ... 
          // depends on the error, probably (permissions or locked: no, 
          // not found: yes)

        }
        else {
          watchFile( file );
          addEditor({ path: file, value: contents, node: opts.node }, toll);
          if( add ){
            // settings doesn't handle arrays
            let arr = FileSettings.openFiles || [];
            arr.push( file );
            FileSettings.openFiles = arr;
          }
        }
        resolve();
      });
    });
  };

  /** 
   * API function: refresh the active tab (other tabs will
   * be refreshed when you switch to them).
   */
  this.refresh = function(){

    // switching to a new tab calls refresh, so we only need
    // to refresh the active tab 

    if( active ) active.cm.refresh();
  }

  /** 
   * API: new buffer 
   */
  this.newFile = function(){
    addEditor();
  };

  /** internal revert method */
  let revert = function( editor ){

    let scrollInfo = editor.cm.getScrollInfo();
    let cursor = editor.cm.getDoc().getCursor();

    return new Promise( function( resolve, reject ){
      fs.readFile( editor.path, { encoding: 'utf8' }, function( err, contents ){
        if( err ){
          PubSub.publish( "file-open-error", err );
        }
        else {
          editor.cm.getDoc().setValue( contents );
          editor.cm.scrollTo( scrollInfo.left, scrollInfo.top );
          editor.cm.getDoc().setCursor( cursor );
          markDirty(false, editor);
        }
        resolve();
      });
    });
  };

  /**
   * API: revert (reload from disk).  this is undoable.
   */
  this.revert = function(){
    return revert(active);
  };

  /**
   * API: close active buffer
   */
  this.close = function(){

    for( let i = 0; i< editors.length; i++ ){
      if( editors[i] === active ){
        closeEditor( i );
        return;
      }
    }
  };

  /**
   * API: select an editor, either by explicit
   * index or by "delta", for use in previous/next
   * window commands.
   */
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

  /**
   * internal save method.  if the passed editor does not have 
   * a path, it will call (internal) saveAs.  otherwise it will 
   * save to the existing path.
   */
  let save = function( editor ){

    if( !editor ){
      if( !active ) return;
      editor = active;
    }

    if( !editor.path ) return saveAs(editor);
    else {
      let contents = editor.cm.getValue();
      ignoreChanges = editor.path;
      fs.writeFile( editor.path, contents, { encoding: "utf8" }, function(err){
        if( err ) PubSub.publish( "file-save-error", err );
        else markDirty(false);
        ignoreChanges = null;
      })
    }
  };

  /**
   * update theme.  we get the actual theme from settings.
   */
  this.updateTheme = function(){
    editors.forEach( function( editor ){
      editor.cm.setOption( "theme", Settings.editor.theme || "default" );
    })
  };

  /**
   * internal saveAs: present a file chooser and select or create a 
   * path, then save to that path.
   */
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

    // change watch from old path -> new path
    if( editor.path ) unwatchFile( editor.path );
    watchFile( rslt );

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
    FileSettings.openFiles = arr;
    ensureMode();

    return true;

  };

  /** API: wraps internal save method */
  this.save = save;

  /** API: wraps internal saveAs method */
  this.saveAs = saveAs;

  // --- find and replace (aka search panel) ---

  let lastSearch = null;
  let findActive = false;
  let replaceActive = false;

  nodes.searchPanel.addEventListener( "click", function(e){
    if( e.target.type === "checkbox" ){
      e.stopPropagation();
      search(true);
    }
    else if( e.target.id === "find-previous" ){
      e.stopPropagation();
      active.cm.find.next(true);
    }
    else if( e.target.id === "find-next" ){
      e.stopPropagation();
      active.cm.find.next();
    }
    else if( e.target.id === "replace-one" ){
      e.stopPropagation();
      replace();
    }
    else if( e.target.id === "replace-all" ){
      e.stopPropagation();
      replace(true);
    }
    else if( e.target.id === "close-search-panel" ){
      e.stopPropagation();
      closeSearch();
    }
  });

  /**
   * API method: display and focus the search panel; 
   * optionally show the "replace" box.
   */
  this.find = function( replace ){
    nodes.searchPanel.style.display = "block";
    findActive = true;
    replaceActive = replace;
    nodes['replace-row'].style.display = replace ? "block" : "none";    

    let node = replace ? nodes['replace-text'] : nodes['find-text'];

    node.select();
    node.focus();

    search(true);
  };

  const closeSearch = function(){
    if( active ) active.cm.focus();
    nodes.searchPanel.style.display = "";
    active.cm.find.clear();
    findActive = false;
  };

  nodes['find-text'].addEventListener( "keydown", function(e){
    switch( e.key ){
      case "Escape":
        e.stopPropagation();
        closeSearch();
        break;
      case "F3":
        e.stopPropagation();
        active.cm.find.next(e.shiftKey);
        break;
    }
  });

  nodes['find-text'].addEventListener( "keyup", function(e){
    e.stopPropagation();
    search();
  });

  const escapeRex = function(string){
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); 
  }

  const parseQuery = function(){
    let text = nodes['find-text'].value;
    if (text.length){

      // for regex, leave as-is.  for non 
      // regex, optionally (default) pass as an
      // icase regex; optionally add \bs.

      if( !nodes['find-regex'].checked )
      {
        let rex = false;
        if( nodes['find-whole-word'].checked ){
          rex = true;
          text = `/\\b${escapeRex(text)}\\b/`;
        }
        if( !nodes['find-case-sensitive'].checked ){
          if( !rex ) text = `/${escapeRex(text)}/`;
          text = text + "i";
        }
      }
    }
    return text;
  };

  const replace = function( all ){
    let query = parseQuery();
    let rep = nodes['replace-text'].value;
    if( all ) active.cm.find.replaceAll( query, rep );
    else active.cm.find.replace( query, rep );
  };

  const search = function(force){
    let text = parseQuery();
    if( force || lastSearch !== text ){
      if (text.length){
        active.cm.find.search(text);
      }
      else active.cm.find.clear();
      lastSearch = text;
    }
  };

  // --- /find and replace ---

  /**
   * API method: open a file, either with an explcit path
   * or starting with a file chooser.
   */
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

  // tail method
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

  // on init, load previously open files or open a 
  // blank buffer (we never have no buffers).
  
  if( FileSettings.openFiles && FileSettings.openFiles.length ){
    loadFiles( FileSettings.openFiles.slice(0)).then( function(){

      // suppose there are recent files, but all of them
      // error out; then we need to open a blank.

      if( tabs.length ) selectTab( Math.min( tabs.length - 1, FileSettings.activeTab || 0));
      else addEditor();
    });
  }
  else {
    addEditor();
  }
};

module.exports = Editor;

