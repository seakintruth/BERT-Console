
"use strict";

// css includes (webpack-style)
require( "../style/main.css" );

// electron components
const {remote} = window.require('electron');
const {Menu, MenuItem, dialog} = remote;

// node modules
const PubSub = require( "pubsub-js" );
const Shell = require( "cmjs-shell" );
const fs = require( "fs" );
const path = require( "path" );

// local modules
const Splitter = require( "./splitter.js" );
const Settings = require( "./settings.js" );
const PipeR = require( "./piper.js" );
const Editor = require( "./editor.js" );

// globals
let splitter1, splitter2;
let shell, editor;
let R = new PipeR();

let last_parse_status = Shell.prototype.PARSE_STATUS.OK;

PubSub.subscribe( "settings-change", function( channel, update ){
  // console.info( "SC", update );
});

PubSub.subscribe( "splitter-resize", function( channel, splitter ){
  Settings.layout = {
    splitter1: splitter1.size.slice(0),
    splitter2: splitter2.size.slice(0)
  }
});

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
      console.info( list );
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

// on load, set up document
document.addEventListener("DOMContentLoaded", function(event) {

  // this seems a bit fragile, perhaps these should be separate members 
  let layout = Settings.layout || {
    splitter1: [20, 80], splitter2: [50, 50]
  };

  splitter1 = new Splitter({ node: document.body, size: layout.splitter1 });
  splitter2 = new Splitter({ 
    node: splitter1.panes[1], 
    size: layout.splitter2,
    direction: Splitter.prototype.Direction.VERTICAL 
  });

  let shellContainer = splitter2.panes[1];
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

  editor = new Editor({ node: splitter2.panes[0] });

  shell.setOption("theme", "dark");
  shell.refresh();

  if (Settings["line.wrapping"]) shell.setOption("lineWrapping", true);
  shell.setOption("matchBrackets", true);

  R.on( "console", function( message, flag ){
    if( flag === 1 ) shell.response( message, "shell-error" ); 
    else shell.response( message );
  })
  R.init();

  const mainMenu = Menu.buildFromTemplate([
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
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: function(){}
        },
        {
          type: 'separator'
        },
        {
          role: 'quit'
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
        {
          role: 'pasteandmatchstyle'
        },
        {
          role: 'delete'
        },
        {
          role: 'selectall'
        }
      ]
    },
    {
      label: "View",
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click (item, focusedWindow) {
            if (focusedWindow) focusedWindow.reload()
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
    {
      label: "Window",
      submenu: [
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
        }
      ]
    }

  ]);
  Menu.setApplicationMenu(mainMenu);

});
