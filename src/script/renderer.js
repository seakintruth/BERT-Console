
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
//const Shell = require( "../../../constructr/cmjs-shell/shell.js" );

// local modules
const Splitter = require( "./splitter.js" );
const Settings = require( "./settings.js" );
const PipeR = require( "./piper.js" );
const Editor = require( "./editor.js" );
const Utils = require( "./utils.js" );
const Notifier = require( "./notify.js" );

const Resize = require( "./resize-events.js" );
const MenuTemplate = require( "../data/menu.json" );

// globals
let splitWindow;
let shell, editor;
let R = new PipeR();

let focused = null;
let statusMessage = null;
let fmcount = 0;

const USER_STYLESHEET_PATH = "dist/user-stylesheet.css";

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
  case "hide_shell":
    splitWindow.setVisible( 1, !Settings.hide_shell );
    if( !Settings.hide_shell ) shell.refresh();
    updateFocusMessage();
    resizeShell(true);
    break;

  case "hide_editor":
    splitWindow.setVisible( 0, !Settings.hide_editor );
    if( !Settings.hide_editor ) editor.refresh();
    updateFocusMessage();
    resizeShell(true);
    break;  

  case "layout_vertical":
    updateLayout( Settings.layout_vertical ? 
      Splitter.prototype.Direction.VERTICAL : 
      Splitter.prototype.Direction.HORIZONTAL, true  );
    break;

  case "auto_resize":
    if( Settings.auto_resize ) resizeShell();
    break;

  case "allow_reloading":

    // this is overkill here, because all we need to do 
    // is enable the reload item

    updateMenu();
    break;

  case "shell_wrap":
    shell.setOption( "lineWrapping", Settings.shell_wrap );
    shell.refresh();
    break;

  default:
    console.info( "unhandled settings change", update );
    break;
  }
});

let lastShellSize = -1;

const resizeShell = function(){
  if( Settings.auto_resize ){
    let w = shell.get_width_in_chars();
    if( lastShellSize === w ) return;
    lastShellSize = Math.max( 10, w );
    R.internal( ["set-console-width", lastShellSize], "set-console-width" );
  }
}

PubSub.subscribe( "window-resize", function( channel ){
  resizeShell();
});

PubSub.subscribe( "splitter-resize", function( channel, splitter ){
  Settings.layout = {
    splitWindow: splitWindow.size.slice(0)
  }
  resizeShell();
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

  if (Settings.hide_function_tips) return;
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

// menu

/*
  let menuTemplate = [
    {
      label: "File", 
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: function(){ editor.newFile(); }
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: function(){ editor.open(); }
        },
        {
          id: 'open_recent',
          submenu: [],
          label: 'Open Recent'
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: function(){ editor.save(); }
        },
        {
          label: 'Save As...',
          accelerator: 'Ctrl+Shift+S',
          click: function(){ editor.saveAs(); }
        },
        {
          label: 'Revert',
          click: function(){ editor.revert(); }
        },
        {
          label: 'Close Document',
          accelerator: 'CmdOrCtrl+W',
          click: function(){ editor.close(); }
        },
        {
          type: 'separator'
        },
        {
          role: 'quit',
          label: 'Close BERT Console'
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        {
        role: 'undo'
        },
        {
          role: 'redo'
        },
        {
          type: 'separator'
        },
        {
          role: 'cut'
        },
        {
          role: 'copy'
        },
        {
          role: 'paste'
        },
        / *
        {
          role: 'pasteandmatchstyle'
        },
        * /
        {
          role: 'delete'
        },
        {
          role: 'selectall'
        },
         {
          type: 'separator'
        },
        {
          label: 'Find',
          accelerator: 'Ctrl+F',
          click: function(){
            editor.find();
          }
        },
        {
          label: 'Replace',
          accelerator: 'Ctrl+H',
          click: function(){
            editor.find(true);
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
       
        {
          id: 'editor_check',
          label: 'Show Editor',
          type: 'checkbox',
          checked: !Settings.hide_editor,
          accelerator: 'Ctrl+Shift+E',
          click: function( item ){
            splitWindow.setVisible( 0, item.checked );
            Settings.hide_editor = !item.checked;
            if( item.checked ) editor.refresh();
            updateFocusMessage();
            resizeShell(true);
          }
        },
        {
          id: 'shell_check',
          label: 'Show R Shell',
          type: 'checkbox',
          checked: !Settings.hide_shell,
          accelerator: 'Ctrl+Shift+R',
          click: function( item ){
            splitWindow.setVisible( 1, item.checked );
            Settings.hide_shell = !item.checked;
            shell.refresh();
            updateFocusMessage();
            resizeShell(true);
          }
        },
         {
          label: 'Layout',
          submenu: [
            {
              id: 'top_and_bottom',
              label: 'Top and Bottom',
              click( item, focusedWindow ){
                updateLayout( Splitter.prototype.Direction.VERTICAL, true  );
              },
              type: 'radio',
              //checked: splitWindow.vertical
            },
            {
              id: 'side_by_side',
              label: 'Side by Side',
              click( item, focusedWindow ){
                updateLayout( Splitter.prototype.Direction.HORIZONTAL, true );
              },
              type: 'radio',
              //checked: !splitWindow.vertical
            }
          ]
        },
        {type: 'separator'},

        {
          label: "Editor",
          submenu: [
            {
              id: 'editor_theme',
              label: "Theme"
            },
            {
              label: "Show Line Numbers",
              type: "checkbox",
              checked: !Settings.editor_hide_linenumbers,
              click: function(item){ Settings.editor_hide_linenumbers = !item.checked; }
            },
            {
              label: "Show Status Bar",
              type: "checkbox",
              checked: !Settings.editor_hide_status_bar,
              click: function(item){ Settings.editor_hide_status_bar = !item.checked; }
            }
          ]
        },

        {
          label: "Shell",
          submenu: [
            {
              id: 'shell_theme',
              label: "Theme"
            },
            {
              label: "Update Console Width on Resize",
              type: "checkbox",
              checked: !!Settings.auto_resize,
              click: function(item){
                Settings.auto_resize = item.checked;
                if( item.checked ) resizeShell();
              }
            },
            {
              label: "Wrap Long Lines",
              type: "checkbox",
              checked: !!Settings.shell_wrap,
              click: function(item){ 
                Settings.shell_wrap = item.checked; 
                shell.setOption( "lineWrapping", Settings.shell_wrap );
                shell.refresh();
              }
            },
          ]
        },

        {
          label: "User Stylesheet",
          click: function(){
            editor.open( USER_STYLESHEET_PATH );
          }
        },

        { type: 'separator' },

        {
          label: "Developer",
          submenu: [
            {
              label: 'Allow Reloading',
              type: 'checkbox',
              checked: !!Settings.allow_reloading,
              click: function(item){
                Settings.allow_reloading = item.checked;
                item.menu.items.forEach( function( item ){
                  if( item.id === "reload" ) item.enabled = Settings.allow_reloading;
                });
              }
            },
            {
              id: 'reload',
              label: 'Reload',
              accelerator: 'CmdOrCtrl+R',
              enabled: Settings.allow_reloading,
              click (item, focusedWindow) {
                if (focusedWindow && Settings.allow_reloading){
                  global.allowReload = true;
                  focusedWindow.reload()
                }
              }
            },
            {
              label: 'Toggle Developer Tools',
              accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
              click (item, focusedWindow) {
                if (focusedWindow) focusedWindow.webContents.toggleDevTools()
              }
            }

          ]
        },

      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About",
          click() { about_dialog(); }
        },
        {
          label: "Learn More",
          click () { window.require('electron').shell.openExternal('https://bert-toolkit.com') }
        },
        { type: 'separator' },
        {
          label: "Feedback",
          click () { window.require('electron').shell.openExternal('https://bert-toolkit.com/contact') }
        }
      ]
    }

  ];
*/

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
    if (opts.focusedWindow && Settings.allow_reloading){
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
  let f = path.join( process.cwd(), USER_STYLESHEET_PATH ); // + "?" + new Date().getTime();
  Utils.ensureCSS( f, { 'data-position': 'last', 'data-id': 'user-stylesheet' }, document.head );

};

let updateMenu = function(){  

  let node, template = MenuTemplate;

  Utils.updateSettings( Settings, template );  

  // set enabled for reload
  node = Utils.findNode( "reload", template );
  if( node ) node.enabled = Settings.allow_reloading;

//  // set checked for top/bottom, left/right
//  node = Utils.findNode( "top-and-bottom", template );
//  if( node ) node.checked = splitWindow.vertical;
//
//  node = Utils.findNode( "side-by-side", template );
//  if( node ) node.checked = !splitWindow.vertical;

  // editor, shell visible
//  node = Utils.findNode( "editor-check", template );
//  if( node ) node.checked = splitWindow.visible[0];
//
//  node = Utils.findNode( "shell-check", template );
//  if( node ) node.checked = splitWindow.visible[1];

  // set recent files
  node = Utils.findNode( "open-recent", template );
  let recent = Settings.recent_files || [];
  let elements = recent.map( function( file ){
    return {
      label: file,
      click: function(){ editor.open( file ) }
    }
  });
  node.submenu = elements.reverse().slice(0,13);

  fs.readdir( "dist/theme", function( err, files ){

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
      let checked = Settings[which + "_theme"] || ( which === "editor" ? "default" : "dark" );
      
      node.submenu = themes.map( function( theme ){
        return {
          label: theme, type: 'radio', checked: (checked === theme),
          click: function(){ 
            Settings[which + "_theme"] = theme;
            updateThemes();
          }
        };
      });
    });

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  });

};

let updateThemes = function(){

  shell.setOption("theme", Settings.shell_theme || "dark");
  shell.refresh();
  editor.updateTheme();

  [Settings.shell_theme, Settings.editor_theme].forEach( function( theme ){
    if( theme && theme !== "default" ) {
      Utils.ensureCSS( `dist/theme/${theme}.css`, { 'data-watch': true } ); 
    }
  });

};

PubSub.subscribe( "menu-update", updateMenu );

let updateLayout = function( dir, reset ){
  splitWindow.setDirection(dir);
  Settings.layoutDirection = dir;
  if( reset ){
    splitWindow.setVisible(0, true);
    splitWindow.setVisible(1, true);
    splitWindow.setSizes( 50, 50 );
  }
  shell.refresh();
  editor.refresh();
  resizeShell();
};
  

// on load, set up document
document.addEventListener("DOMContentLoaded", function(event) {

  // webpack inserts css as style blocks, so we need to ensure that this is last.  
  updateUserStylesheet();

  let layout = Settings.layout || {
    splitWindow: [50, 50]
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
    size: layout.splitWindow,
//    direction: Settings.layoutDirection || Splitter.prototype.Direction.HORIZONTAL 
    direction: Settings.layout_vertical ? 
      Splitter.prototype.Direction.VERTICAL : 
      Splitter.prototype.Direction.HORIZONTAL
  });

  if( Settings.hide_editor ) splitWindow.setVisible( 0, false );
  if( Settings.hide_shell ) splitWindow.setVisible( 1, false );

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

  shell.setOption( "lineWrapping", !!Settings.shell_wrap );

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

  if (Settings["line.wrapping"]) shell.setOption("lineWrapping", true);
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
  if( !process.env.BERT_DEV_NO_PIPE ){
    R.init({ pipename: pipename });
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

});

