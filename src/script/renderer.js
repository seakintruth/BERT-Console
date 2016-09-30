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

// css includes (webpack-style)
require( "../style/main.css" );

// electron components
const {remote} = window.require('electron');
const {Menu, MenuItem, dialog} = remote;

// node modules
const PubSub = require( "pubsub-js" );
const fs = require( "fs" );
const path = require( "path" );
const chokidar = window.require('chokidar');
const Shell = require( "cmjs-shell" );

// initialize the global settings store.  this is file-based.  put it in 
// the app home directory (i.e. root)?  

let settingsKey = "bert-shell-settings.json";
if( process.env.BERT_SHELL_HOME ) settingsKey = path.join( process.env.BERT_SHELL_HOME, settingsKey );

// settings has some defaults -- in particular, the containing objects

global.Settings = require( "./settings.js" ).createStore({ 
  name: "general", type: "file", key: settingsKey, watch: true, defaults: {
    layout: { vertical: false },
    shell: { functionTips: true },
    developer: {}
  }});

// layout settings are in localStorage instead of the settings file

global.LayoutSettings = require( "./settings.js" ).createStore({
  name: "layout", event: null, type: "localStorage", key: "layout", defaults: {
    split: [50, 50]
  }});

// local modules
const Splitter = require( "./splitter.js" );
const PipeR = require( "./piper.js" );
const Editor = require( "./editor.js" );
const Utils = require( "./utils.js" );
const Notifier = require( "./notify.js" );
const Resize = require( "./resize-events.js" );
const MenuTemplate = require( "../data/main-menu.js" );

// globals
let splitWindow;
let shell, editor;
let R = new PipeR();

let focused = null;
let statusMessage = null;
let fmcount = 0;

//const USER_STYLESHEET_PATH = "user-stylesheet.css";
let USER_STYLESHEET_PATH = "user-stylesheet.css";
if( process.env.BERT_SHELL_HOME ) USER_STYLESHEET_PATH = path.join( process.env.BERT_SHELL_HOME, USER_STYLESHEET_PATH );

let last_parse_status = Shell.prototype.PARSE_STATUS.OK;

// FIXME: theme files
chokidar.watch( USER_STYLESHEET_PATH ).on('change', (event, path) => {
  updateUserStylesheet();
});

PubSub.subscribe( "focus-event", function( channel, owner ){
  focused = owner;
  updateFocusMessage();
});

PubSub.subscribe( "execute-block", function( channel, code ){
  if( !code.endsWith( "\n" )) code = code + "\n";
  shell.execute_block( code );
});

PubSub.subscribe( "editor-new-tab", function(){

  // if the editor is not visible, show it
  if( !splitWindow.visible[0] ){

    splitWindow.setVisible( 0, true );
    if( splitWindow.size[0] < 13 ) splitWindow.setSizes( 50, 50 );
    updateMenu();

  }

});

R.on( "control", function(){
  // console.info( "CTL", arguments );
})

R.on( "pipe-closed", function(){
  global.__quit =  true;
  remote.getCurrentWindow().close();
});

const setStatusMessage = function( message ){
  if( !statusMessage ) statusMessage = document.getElementById( "status-message" );
  if( !statusMessage ) return;
  statusMessage.textContent = message;
}

let updateFocusMessage = function(){
  let message;
  if(!(splitWindow.visible[0] && splitWindow.visible[1] )) message = "";
  else {
    message = ( focused === "editor" ? "Editor" : "Shell" ) + " has focus";
    if( fmcount++ < 5 ){
      message += " (use Ctrl+E to switch)";
    }
  }
  setStatusMessage( message );  
};

PubSub.subscribe( "splitter-drag", function( channel, splitter ){
  setStatusMessage(
    `Layout: ${splitter.size[0].toFixed(1)}% / ${splitter.size[1].toFixed(1)}%` );
});

PubSub.subscribe( "settings-change", function( channel, update ){

  switch( update.key ){

  case "shell.theme":
  case "editor.theme":
    updateThemes();
    break;

  case "shell.hide":
    splitWindow.setVisible( 1, !Settings.shell.hide );
    if( !Settings.shell.hide ) shell.refresh();
    updateFocusMessage();
    resizeShell(true);
    break;

  case "editor.hide":
    splitWindow.setVisible( 0, !Settings.editor.hide );
    if( !Settings.editor.hide ) editor.refresh();
    updateFocusMessage();
    resizeShell(true);
    break;  

  case "layout.vertical":
    updateLayout( Settings.layout.vertical ? 
      Splitter.prototype.Direction.VERTICAL : 
      Splitter.prototype.Direction.HORIZONTAL, true  );
    break;

  case "shell.resize":
    if( Settings.shell.resize ) resizeShell();
    break;

  case "developer.allowReloading":

    // this is overkill here, because all we need to do 
    // is enable the reload item

    updateMenu();
    break;

  case "shell.wrap":
    shell.setOption( "lineWrapping", Settings.shell.wrap );
    shell.refresh();
    break;

  default:
    console.info( "unhandled settings change", update );
    break;
  }
});

let lastShellSize = -1;

const resizeShell = function(){
  if( Settings.shell.resize ){
    let w = shell.get_width_in_chars();
    if( lastShellSize === w ) return;
    lastShellSize = Math.max( 10, w );
    R.internal( ["set-console-width", lastShellSize], "set-console-width" );
  }
}

PubSub.subscribe( "window-resize", function( channel ){
  resizeShell();
  shell.refresh();
  editor.refresh();
});

PubSub.subscribe( "splitter-resize", function( channel, splitter ){
  LayoutSettings.layout = {
    split: splitWindow.size.slice(0)
  }
  resizeShell();
  shell.refresh();
  editor.refresh();
});

window.addEventListener( "keydown", function(e){
  if( e.ctrlKey ){
    if( e.code === "PageUp" ){
      e.stopPropagation();
      e.preventDefault();
      editor.selectEditor({ delta: -1 });
    }
    else if( e.code === "PageDown" ){
      e.stopPropagation();
      e.preventDefault();
      editor.selectEditor({ delta: 1 });
    }
    else if( e.code === "KeyE" && !e.shiftKey ){
      e.stopPropagation();
      e.preventDefault();
      if( focused === "editor" ) shell.focus();
      else editor.focus();
    }
    // else console.info( e.code );
    return;
  }
})

var tip_function = function (text, pos) {

  if (!Settings.shell.functionTips) return;
  R.internal([ "autocomplete", text, pos ], "autocomplete").then(function (obj) {

    if (obj['signature'])  shell.show_function_tip(obj['signature']);
    else shell.hide_function_tip();

  }).catch(function (e) {

    console.error(e);

    // generally speaking we can ignore this, although
    // we probably need some filter... for now we will ignore

    // FIXME: debug?

  });
};

var hint_function = function (text, pos, callback) {

  // escape both single and double quotes
  text = text.replace(/"/g, "\\\"");
  text = text.replace(/'/g, "\\'");

  R.internal([ "autocomplete", text, pos ], "autocomplete").then(function (obj) {

    if (obj.comps && obj.comps !== "NA") {
      var list = obj.comps;
      if (typeof list === "string") list = list.split(/\n/g ); // [list];
      //console.info( list );
      //callback(list, obj.response.start, obj.response.end);
      callback( list, obj.start + 1, obj.end + 1 );
    }
    else callback();

  }).catch(function (obj) { callback(); });

}

const exec_function = function( lines, callback ){

  if( !R.initialized ){
    shell.response( "Not connected\n", "shell-error" );
    callback();
    return;
  }

  if( !lines.length ) return;
  if( lines.length === 1 && !lines[0].length && last_parse_status === Shell.prototype.PARSE_STATUS.OK ){
    callback();
    return;
  }
  R.exec( lines ).then( function( rslt ){

    last_parse_status = Shell.prototype.PARSE_STATUS.OK;
    if( rslt.parsestatus === 2 ){
      rslt.parsestatus = last_parse_status = Shell.prototype.PARSE_STATUS.INCOMPLETE;
    }
    callback( rslt );
    
  }).catch( function( err ){
    console.info( "E", err);
    callback( err );
  })

};

const versions = {};
function check_version(dir) {
  fs.readFile(path.join(dir, "package.json"), { encoding: "utf8" }, (err, data) => {
    if (data) {
      var obj = JSON.parse(data);
      if (obj && obj.name && obj.version) {
        versions[obj.name] = obj.version;
      }
    }
  });
};
check_version(__dirname);

var about_dialog = function () {
  dialog.showMessageBox(remote.getCurrentWindow(), {
    type: "info",
    title: "Basic Excel R Toolkit",
    buttons: ["OK"],
    message: `BERT ${versions['bert']}`,
    detail: versions.R + "\n"
    + `Node ${process.versions.node}\n`
    + `Chrome ${process.versions.chrome}\n`
    + `Electron ${process.versions.electron}`
  });
};

PubSub.subscribe( "menu-click", function( channel, opts ){

  // opts: { id, template, item, focusedWindow }

  switch( opts.id ){
  case "toggle-developer":
    if (opts.focusedWindow) opts.focusedWindow.webContents.toggleDevTools()
    break;

  case "user-stylesheet": editor.open( USER_STYLESHEET_PATH ); break;

  case "file-new": editor.newFile(); break;
  case "file-open": editor.open(); break;
  case "file-save": editor.save(); break;
  case "file-save-as": editor.saveAs(); break;
  case "file-revert": editor.revert(); break;
  case "file-close": editor.close(); break;

  case "find": editor.find(); break;
  case "replace": editor.find(true); break;

  case "help-about": about_dialog(); break;
  case "help-learn-more":
    window.require('electron').shell.openExternal('https://bert-toolkit.com');
    break;
  case "help-feedback":
    window.require('electron').shell.openExternal('https://bert-toolkit.com/contact');
    break;

  case "reload": 
    if (opts.focusedWindow && Settings.developer.allowReloading){
      global.allowReload = true;
      opts.focusedWindow.reload()
    }
    break;

  default: 
    console.warn( "Unhandled menu command:", opts[0] );
  };


});

let updateUserStylesheet = function(){

  let s = `link[data-id=user-stylesheet]`;
  let node = document.head.querySelector( s );
  if( node ){
    node.parentNode.removeChild( node );
  }
  
  Utils.ensureCSS( USER_STYLESHEET_PATH, 
    { 'data-position': 'last', 'data-id': 'user-stylesheet' }, 
    document.head );

};

let updateMenu = function(){  

  let node, template = MenuTemplate;

  Utils.updateSettings( Settings, template );  

  // set enabled for reload
  node = Utils.findNode( "reload", template );
  if( node ) node.enabled = Settings.developer.allowReloading;

  // set recent files
  node = Utils.findNode( "open-recent", template );
  let recent = editor.getRecentFiles();
  let elements = recent.map( function( file ){
    return {
      label: file,
      click: function(){ editor.open( file ) }
    }
  });
  node.submenu = elements.reverse().slice(0,13);

  fs.readdir( "theme", function( err, files ){

    let themes = [];    
    if( !err ){
      themes = files.filter( function( test ){
        return test.match( /\.css$/i );
      }).map( function( file ){
        let p = path.parse( file );
        return p.name;
      }).sort();
      themes.unshift( "default" );
    }

    ["editor", "shell"].forEach( function( which ){
      node = Utils.findNode( which + "-theme", template );
      let checked = Settings[which].theme || ( which === "editor" ? "default" : "dark" );
      
      node.submenu = themes.map( function( theme ){
        return {
          label: theme, type: 'radio', checked: (checked === theme),
          click: function(){ 
            Settings[which].theme = theme;
          }
        };
      });
    });

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  });

};

let updateThemes = function(){

  shell.setOption("theme", Settings.shell.theme || "dark");
  shell.refresh();
  editor.updateTheme();

  [Settings.shell.theme, Settings.editor.theme].forEach( function( theme ){
    if( theme && theme !== "default" ) {
      
//      Utils.ensureCSS( `theme/${theme}.css`, { 'data-watch': true } ); 
        Utils.ensureCSS( path.join( process.env.BERT_SHELL_HOME,`theme/${theme}.css` ), { 'data-watch': true } ); 
    }
  });

};

PubSub.subscribe( "menu-update", updateMenu );

let updateLayout = function( dir, reset ){

  splitWindow.setDirection(dir);

  if( reset ){
    splitWindow.setVisible(0, true);
    splitWindow.setVisible(1, true);
    splitWindow.setSizes( 50, 50 );
  }

  shell.refresh();
  editor.refresh();
  resizeShell();

};

PubSub.subscribe( "settings-error", function( channel, args ){

  let msg = "Invalid settings file";
  if( args.exception ) msg = msg + ": " + args.exception.message;

  Notifier.notify({
    title: "WARNING",
    className: "warning",
    body: msg,
    timeout: 9,
    footer: "OK"
  });
});

PubSub.subscribe( "file-read-error", function( channel, args ){
  Notifier.notify({
    title: "ERROR",
    className: "error",
    body: "reading file: " + args.err.message,
    timeout: 9,
    footer: "OK"
  });
});

PubSub.subscribe( "file-write-error", function( channel, args ){
  Notifier.notify({
    title: "ERROR",
    className: "error",
    body: "writing file " + args.err.message,
    timeout: 9,
    footer: "OK"
  });
});

// on load, set up document
document.addEventListener("DOMContentLoaded", function(event) {

  // webpack inserts css as style blocks, so we need to ensure that this is last.  
  updateUserStylesheet();

  let layout = LayoutSettings.layout || {
    split: [50, 50]
  };

  /*
  splitter1 = new Splitter({ node: document.body, size: layout.splitter1 });
  splitWindow = new Splitter({ 
    node: splitter1.panes[1], 
    size: layout.splitWindow,
    direction: Settings.layoutDirection || Splitter.prototype.Direction.VERTICAL 
  });

  window.s1 = splitter1;
  window.s2 = splitWindow;

  let shellContainer = splitWindow.panes[1];
  */

  splitWindow = new Splitter({ 
    node: document.body, 
    size: layout.split,
    direction: Settings.layout.vertical ? 
      Splitter.prototype.Direction.VERTICAL : 
      Splitter.prototype.Direction.HORIZONTAL
  });

  if( Settings.editor.hide ) splitWindow.setVisible( 0, false );
  if( Settings.shell.hide ) splitWindow.setVisible( 1, false );

  let shellContainer = splitWindow.panes[1];
  
  shellContainer.classList.add( "shell" );

   // shell
  shell = new Shell(CodeMirror, {
    // debug: true,
    container: shellContainer,
    cursorBlinkRate: 0,
    mode: "r",
    hint_function: hint_function,
    tip_function: tip_function,
    exec_function: exec_function,
    //function_key_callback: function_key_callback,
    //suppress_initial_prompt: true,
    viewport_change: function () {
      PubSub.publish("viewport-change");
    }
  });

  shell.setOption( "lineWrapping", !!Settings.shell.wrap );

  const shellContextMenu = Menu.buildFromTemplate([
    { label: 'Select All', click: function(){
      shell.select_all();
    }},
    { role: 'copy' },
    { role: 'paste' },
    { type: 'separator' },
    { label: 'Clear Shell', click: function(){
      shell.clear();
    }}
  ]);

  shellContainer.addEventListener('contextmenu', function(e){
    e.preventDefault();
    shellContextMenu.popup(remote.getCurrentWindow());
  }, false);

  editor = new Editor({ node: splitWindow.panes[0] });

  if (Settings["shell.wrap"]) shell.setOption("lineWrapping", true);
  shell.setOption("matchBrackets", true);

  shell.getCM().on( "focus", function(){
    PubSub.publish( "focus-event", "shell" );
  });

  R.on( "console", function( message, flag ){
    shell.response( message, flag ? "shell-error" : "shell-text" );
  })

  let pipename = process.env.BERT_PIPE_NAME;
  for( let i = 0; i< process.argv.length; i++ ){
    if( process.argv[i] === "--pipename" && i< process.argv.length-1 ){
      pipename = process.argv[++i];
    }
  }

  // console.info( "pipename", pipename );
  //if( !process.env.BERT_DEV_NO_PIPE ){
  if( pipename ){ 
    R.init({ pipename: pipename });
  }
  else {
    Notifier.notify({
      title: "WARNING",
      className: "warning",
      body: "Not connected to Excel/R",
      timeout: 9,
      footer: "OK"
    });
    global.__quit = true;
  }

  //console.info( "BH", process.env.BERT_HOME );

  updateThemes();
  Utils.updateMenu( Settings, MenuTemplate );
  updateMenu();

  shell.focus();

  window.addEventListener("beforeunload", function (event) {
    if( global.__quit || global.allowReload ) return;
    event.returnValue = false;
    R.internal( ["hide"], "hide" );
  });

  if( R.initialized ) resizeShell();

  /*
  let classes = [ "warning", "error", "information", "question", "" ];
  let renotify = function(){
    setTimeout( function(){
      let c = classes[ Math.floor( Math.random() * classes.length )];
      Notifier.notify({ 
        className: c,
        title: c.toUpperCase(), body: "garble taco beverage vagine", footer: "OK", timeout: 7
      }).then( function( reason ){
        console.info( "Reason:", reason );
        setTimeout( function(){ renotify() }, 1 );
      })
    }, 500 );
  };
  renotify();
  */

});

