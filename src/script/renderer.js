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
const UpdateCheck = require( "./update-check.js" );
const HTMLDialog = require( "./dialog.js" );
const VList = require( "./vlist.js" );
const Cache = require( "./cache.js" );

const Messages = Utils.getLocaleResource( "messages.js", require("../data/messages.js")).Main;
const MenuTemplates = Utils.getLocaleResource( "menus.js", require( "../data/menus.js" ));

const mirrorChooserTemplate = require( "../data/mirror-chooser.template.html" );
const packageChooserTemplate = require( "../data/package-chooser.template.html" );

// 4 hours for dev, 0 (session) for production
const CRAN_CACHE_TIME = 60 * 60 * 4; 

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

R.on( "control", function( message ){
  if( message === "block" ){
    shell.block();
  }
  else {
    shell.unblock();
  }
})

R.on( "pipe-closed", function(){
  global.__quit =  true;
  remote.getCurrentWindow().close();
});

R.on( "push", function( args ){
  args = args || {};
  if( args.channel === "progress" ) handleProgress( args );
});

const handleProgress = function( args ){

  let node = document.createElement( "div" );
  node.innerText = "ZOMM ZOM";
  shell.insert_node( node );

};

const setStatusMessage = function( message ){
  if( !statusMessage ) statusMessage = document.getElementById( "status-message" );
  if( !statusMessage ) return;
  statusMessage.textContent = message;
}

let updateFocusMessage = function(){
  let message;
  if(!(splitWindow.visible[0] && splitWindow.visible[1] )) message = "";
  else {
    let msg = Messages.CHANGE_FOCUS;
    if( fmcount++ < 5 ) msg = Messages.CHANGE_FOCUS_LONG;
    message = Utils.templateString( msg, focused === "editor" ? Messages.EDITOR : Messages.SHELL );
  }
  setStatusMessage( message );  
};

PubSub.subscribe( "splitter-drag", function( channel, splitter ){
  setStatusMessage( Utils.templateString( Messages.SPLITTER_DRAG, 
    splitter.size[0].toFixed(1), 
    splitter.size[1].toFixed(1)));
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

  case "shell-select-all":
    shell.select_all();
    break;
  case "shell-clear-shell":
    shell.clear();
    break;

  case "r-packages-choose-mirror":
    showMirrorChooser();
    break;

  case "r-packages-install-packages":
    showPackageChooser();
    break;

  default: 
    console.warn( "Unhandled menu command:", opts.id );
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

  let node, template = MenuTemplates.Main;

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

  Utils.ensureCSS( path.join( process.env.BERT_SHELL_HOME,`theme/dark.css` ), { 'data-watch': true } ); 

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

  let msg = Messages.INVALID_SETTINGS_FILE;
  if( args.exception ) msg = msg + ": " + args.exception.message;

  Notifier.notify({
    title: Messages.WARNING,
    className: "warning",
    body: msg,
    timeout: 9,
    footer: Messages.OK
  });
});

PubSub.subscribe( "file-read-error", function( channel, args ){
  Notifier.notify({
    title: Messages.ERROR,
    className: "error",
    body: Utils.templateString( Messages.READING_FILE, args.err.message ),
    timeout: 9,
    footer: Messages.OK
  });
});

PubSub.subscribe( "file-write-error", function( channel, args ){
  Notifier.notify({
    title: Messages.ERROR,
    className: "error",
    body: Utils.templateString( Messages.WRITING_FILE, args.err.message ),
    timeout: 9,
    footer: Messages.OK
  });
});

// on load, set up document
document.addEventListener("DOMContentLoaded", function(event) {

  // webpack inserts css as style blocks, so we need to ensure that this is last.  
  updateUserStylesheet();

  let layout = LayoutSettings.layout || {
    split: [50, 50]
  };

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
    suppress_initial_prompt: true,
    viewport_change: function () {
      PubSub.publish("viewport-change");
    }
  });

  shell.setOption( "lineWrapping", !!Settings.shell.wrap );

  Utils.updateMenu( Settings, MenuTemplates.ShellContext );

  const shellContextMenu = Menu.buildFromTemplate( MenuTemplates.ShellContext );
  
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

  if( pipename ){ 
    R.init({ pipename: pipename });
  }
  else {
    Notifier.notify({
      title: Messages.WARNING,
      className: "warning",
      body: Messages.NOT_CONNECTED,
      timeout: 9,
      footer: Messages.OK
    });
    global.__quit = true;
  }

  updateThemes();
  Utils.updateMenu( Settings, MenuTemplates.Main );
  updateMenu();

  shell.focus();

  window.addEventListener("beforeunload", function (event) {
    if( global.__quit || global.allowReload ) return;
    event.returnValue = false;
    R.internal( ["hide"], "hide" );
  });

  if( R.initialized ) resizeShell();

  let currentVersion = Number( process.env.BERT_VERSION );
  UpdateCheck.checkForUpdates().then( function(){
    if( Settings.update.lastVersion <= currentVersion || Settings.update.lastVersion === Settings.update.notifyVersion ) return;
    Notifier.notify({ 
      className: "information",
      title: Utils.templateString( Messages.UPDATE_AVAILABLE, Settings.update.lastVersion), 
      body: "", 
      footer: `<a class='notifier-link' data-command='download'>${Messages.DOWNLOAD}</a> <a class='notifier-link' data-command='ignore'>${Messages.IGNORE}</a>`, 
      timeout: 10
    }).then( function(reason){
      if( reason.event && reason.event.target ){
        let cmd = reason.event.target.getAttribute( "data-command" );
        switch( cmd ){
        case "download":
          window.require('electron').shell.openExternal('https://bert-toolkit.com/download-bert?from-version=' + process.env.BERT_VERSION );
          break;
        case "ignore":
          Settings.update.notifyVersion = Settings.update.lastVersion;
          break;
        };
      }
    });
  });

});

const showMirrorChooser = function(){

  // this function returns a promise so we can chain 
  // calls with the package chooser (assuming you click OK).
  // if you don't need it you can just discard.

  return new Promise( function( resolve, reject ){

    let vlist, cran = undefined;
    let df = Cache.get( "mirror-list" );

    let chooser = new HTMLDialog(mirrorChooserTemplate);
    chooser.nodes['mirror-chooser-wait'].style.display = "block";
    chooser.nodes['mirror-chooser-list'].style.display = "none";

    let click = function(e){
      let n = e.target;
      while( n && n.parentNode && n.className !== "vlist-list-entry" ){
        n = n.parentNode;
      }
      if( n.className !== "vlist-list-entry" ) return null;
      let d = n.data;
      if( !d.selected ){
        for( let i = 0; i< df.length; i++ ){
          df[i].selected = ( df[i] === d );
          if( df[i].selected ) cran = df[i].URL;
        }
        vlist.repaint();
      }
    };

    // FIXME: don't allow OK without a selection

    chooser.show( click, { fixSize: true }).then( function( result ){
      if( result === "OK" ){
        vlist.cleanup();
        let cmd = `local({r <- getOption("repos"); r["CRAN"] <- "${cran}"; options(repos=r)})`;
        R.internal(['exec', cmd ]).then( function(){
          resolve(cran);
        }).catch( function(e){
          reject(e);
        });
      }
      else resolve(false);
    });

    R.internal([ "exec", "getOption('repos')['CRAN']" ]).then( function( repo ){
      if( repo.type === "response" && repo.response.$data.value.CRAN ){
        cran = repo.response.$data.value.CRAN;
      }
      return df ? Promise.resolve(df) : R.internal([ "exec", "getCRANmirrors()" ], "mirror-chooser");
    }).then(function (obj) {

      if( obj.type === "response" ){
        df = Utils.restructureDataFrame( obj.response.$data.value, true );
        Cache.set( "mirror-list", df, CRAN_CACHE_TIME );
      }
      else if( obj.type === "error" ){
        console.error( obj );

        // ...
      }

      // for whatever reason when storing the URL R adds a trailing 
      // slash -- are we sure that's universal?

      let firstIndex = 0;
      if( cran ){
        let cranslash = cran + "/";
        for( let i = 0; i< df.length; i++ ){
          df[i].selected = ( df[i].URL === cran ) || ( df[i].URL === cranslash );
          if( df[i].selected ) firstIndex = i;
        }
      }

      chooser.nodes['mirror-chooser-wait'].style.display = "none";
      chooser.nodes['mirror-chooser-list'].style.display = "block";

      let update = function( node, data, index ){
        node.querySelector( '.mirror-chooser-name' ).innerText = data.Name;
        node.querySelector( '.mirror-chooser-host' ).innerText = data.Host;

        let s = node.querySelector( '.chooser-radio' );
        if( data.selected ) s.classList.add( "chooser-radio-checked" );
        else s.classList.remove( "chooser-radio-checked" );

        node.data = data;
      };

      let template = `
        <div class='mirror-chooser-entry'>
          <div class='chooser-radio'>
            <div class='chooser-label'>
              <div class='mirror-chooser-name'></div> 
              <div class='mirror-chooser-host'></div> 
            </div>
          </div>
        </div>
      `;

      vlist = new VList( chooser.nodes['mirror-chooser-list'], df, template, update, { firstIndex: firstIndex });

    });
  });

};

/**
 * show the package chooser, but ensure we have a good cran repo
 * first.  if the repo looks ok, go right to the package chooser.
 * otherwise open the mirror chooser.  if the mirror chooser resolves
 * to a URL, then continue; otherwise we're done.
 * 
 * FIXME: add a message to the console on cancel?
 */
const showPackageChooser = function(){

  R.internal([ "exec", "getOption('repos')['CRAN']" ]).then( function( repo ){
    if( repo.type === "response" && repo.response.$data.value.CRAN ){
      let cran = repo.response.$data.value.CRAN;
      if( cran.match( /^http/i )) return Promise.resolve( cran );
    } 
    return showMirrorChooser();
  }).then( function(cran){
    if( cran && cran.match( /^http/ )){
      showPackageChooserInternal(cran);
    }
  });

}

/**
 * if we have a good CRAN repo, start the package chooser.
 * note we're caching packages according to the repo, but we don't 
 * want to hold a lot of these unecessarily. 
 * 
 * FIXME: session storage
 */
const showPackageChooserInternal = function(cran){

  let vlist;
  let currentFilter = "";
  let chooser = new HTMLDialog(packageChooserTemplate);
  let cacheKey = "package-list-" + cran;
  let data = Cache.get( cacheKey );
  let filtered;

  // start with "please wait"
  chooser.nodes['package-chooser-wait'].style.display = "block";
  chooser.nodes['package-chooser-list'].style.display = "none";

  // data filter function 
  let filterData = function(){
    if( !currentFilter || currentFilter.trim() === "" ){
      filtered = data;
    }
    else {
      let rex = new RegExp(currentFilter, "i");
      filtered = [];
      for( let i = 0; i< data.length; i++ ){
        if( data[i][0].match( rex )){
          filtered.push( data[i] );
        }
      }
    }
  };

  // update the filter, update or potentially create the list 
  let updateFilter = function(){
    let f = (chooser.nodes['package-chooser-filter'].value || "").trim();
    if( !vlist || ( currentFilter !== f )){
      currentFilter = f;
      filterData();
      if(!vlist) vlist = new VList( chooser.nodes['package-chooser-list'], filtered, template, update );
      else vlist.updateData( filtered );
    }
  };
  chooser.nodes['package-chooser-filter'].addEventListener( "input", updateFilter );

  // element click 
  let click = function(e){
    let n = e.target;
    while( n && n.parentNode && n.className !== "vlist-list-entry" ){
      n = n.parentNode;
    }
    if( n.className !== "vlist-list-entry" ) return null;
    let data = n.data;
    if( data.installed ) return; // can't toggle

    data.selected = !data.selected;
    vlist.repaint();

    // console.info( "index", n.index, "data", n.data );
  };

  // vlist update function 
  let update = function( node, data, index ){

    // console.info( "UPDATE", data[0], index );

    node.data = data;
    node.index = index;

    let s = data[0];
    // let cb = node.querySelector( '.package-chooser-checkbox' );
    let name = node.querySelector( '.package-chooser-name' );

    //cb.checked = data.installed || data.selected;
    if( data.installed ){
      s += " (installed)";
      name.parentNode.classList.add( "disabled" );
    }
    else name.parentNode.classList.remove( "disabled" );

    if( data.installed || data.selected ){
      name.parentNode.classList.add("chooser-checkbox-checked");
    }
    else {
      name.parentNode.classList.remove("chooser-checkbox-checked");
    }

    name.innerText = s;

  };

  // base template (FIXME: move to html file) 
  let template = `
    <div class='package-chooser-entry'>
      <div class='chooser-checkbox'>
          <label class='package-chooser-name'></label>
      </div>
    </div>
  `;

  chooser.show(click, {fixSize: true}).then( function( result ){
    console.info( "Close dialog", result );
    chooser.nodes['package-chooser-filter'].removeEventListener( "input", updateFilter );
    vlist.cleanup();

    if( result === "OK" ){
      let list = [];
      for( let i = 0; i< data.length; i++ ){
        if( data[i].selected ){
          console.info( data[i][0] );
          list.push( `"${data[i][0]}"` );
        }
      }
      if( list.length ){
        let cmd = `install.packages(c(${list.join(",")}))`;
        console.info( cmd );
        PubSub.publish( "execute-block", cmd );
      }
    }

  });

  // get list of installed packages.  don't cache this.
  R.internal(["exec", "installed.packages()"]).then( function( rslt ){

    let installed = [];
    if( rslt.type === "response" ){
      let rows = rslt.response.$data.value.$nrows;
      installed = rslt.response.$data.value.$data.slice(0, rows);
    }

    // next get list of available packages (unless we have cache)
    let p = data ? Promise.resolve(data) : R.internal([ "exec", "available.packages()" ], "package-chooser");
    p.then( function( obj ){

      if( obj.type === "response" ){

        // this is a matrix, column-major.
        let mat = obj.response.$data.value;
        data = new Array(mat.$nrows);

        for( let i = 0; i< mat.$nrows; i++ ){
          data[i] = new Array( mat.$ncols );
        }

        let index = 0;
        for( let j = 0; j< mat.$ncols; j++ ){
          for( let i = 0; i< mat.$nrows; i++, index++ ){
            data[i][j] = mat.$data[index];
          }
        }

        Cache.set( cacheKey, data, CRAN_CACHE_TIME );

      }
      else if( obj.type === "error" ){
        console.error(obj);

        // ...
      }

      // map installed flag... Q: are these in lexical sort order?
      // A: they're definitely not, so we have to do this the hard way.
      // A2: or sort, then do it?  is that actually cheaper? [probably]

      let scmp = function(a, b){ return a < b ? -1 : ( a > b ? 1 : 0 ); };
      let names = new Array( data.length );
      for( let i = 0; i< names.length; i++ ){
        names[i] = [ data[i][0], i ];
        data[i].index = i;
      };

      names.sort(function(a, b){ return scmp(a[0], b[0]); });
      installed.sort(scmp);

      for( let i = 0, j = 0; i< names.length && j< installed.length; ){
        let c = scmp( names[i][0], installed[j] );
        if( c === 0 ){
          data[names[i][1]].installed = true;
          i++, j++;
        }
        else if( c < 0 ) i++;
        else j++;
      };

      chooser.nodes['package-chooser-wait'].style.display = "none";
      chooser.nodes['package-chooser-list'].style.display = "block";
     
      updateFilter(); // will implicitly create the list

    });
  });

};

