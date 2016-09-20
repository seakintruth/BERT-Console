
"use strict";

module.exports = [
  {
    label: "File",
    submenu: [
      {
        id: "file-new",
        label: "New",
        accelerator: "CmdOrCtrl+N"
      },
      {
        id: "file-open",
        label: "Open...",
        accelerator: "CmdOrCtrl+O"
      },
      {
        id: "open-recent",
        submenu: [],
        label: "Open Recent"
      },
      {
        id: "file-save",
        label: "Save",
        accelerator: "CmdOrCtrl+S"
      },
      {
        id: "file-save-as",
        label: "Save As...",
        accelerator: "Ctrl+Shift+S"
      },
      {
        id: "file-revert",
        label: "Revert"
      },
      {
        id: "file-close",
        label: "Close Document",
        accelerator: "CmdOrCtrl+W"
      },
      {
        type: "separator"
      },
      {
        role: "quit",
        label: "Close BERT Console"
      }
    ]
  },
  {
    label: "Edit",
    submenu: [
      {
        role: "undo"
      },
      {
        role: "redo"
      },
      {
        type: "separator"
      },
      {
        role: "cut"
      },
      {
        role: "copy"
      },
      {
        role: "paste"
      },
      {
        role: "delete"
      },
      {
        role: "selectall"
      },
      {
        type: "separator"
      },
      {
        id: "find",
        label: "Find",
        accelerator: "Ctrl+F"
      },
      {
        id: "replace",
        label: "Replace",
        accelerator: "Ctrl+H"
      }
    ]
  },
  {
    label: "View",
    submenu: [
      {
        label: "Show Editor",
        type: "checkbox",
        setting: "editor.hide",
        invert: true,
        accelerator: "Ctrl+Shift+E"
      },
      {
        label: "Show R Shell",
        type: "checkbox",
        setting: "shell.hide",
        invert: true,
        accelerator: "Ctrl+Shift+R"
      },
      {
        label: "Layout",
        submenu: [
          {
            label: "Top and Bottom",
            type: "radio",
            setting: "layout.vertical",
            invert: false
          },
          {
            label: "Side by Side",
            type: "radio",
            setting: "layout.vertical",
            invert: true
          }
        ]
      },
      {
        type: "separator"
      },
      {
        label: "Editor",
        submenu: [
          {
            id: "editor-theme",
            label: "Theme"
          },
          {
            label: "Show Line Numbers",
            type: "checkbox",
            setting: "editor.line_numbers"
          },
          {
            label: "Show Status Bar",
            type: "checkbox",
            setting: "editor.status_bar"
          }
        ]
      },
      {
        label: "Shell",
        submenu: [
          {
            id: "shell-theme",
            label: "Theme"
          },
          {
            label: "Update Console Width on Resize",
            type: "checkbox",
            setting: "shell.resize"
          },
          {
            label: "Wrap Long Lines",
            type: "checkbox",
            setting: "shell.wrap"
          },
          {
            label: "Function Tips",
            type: "checkbox",
            setting: "shell.function_tips"
          }
        ]
      },
      {
        id: "user-stylesheet",
        label: "User Stylesheet"
      },
      "separator",
      {
        label: "Developer",
        submenu: [
          {
            label: "Allow Reloading",
            type: "checkbox",
            setting: "developer.allow_reloading"
          },
          {
            id: "reload",
            label: "Reload",
            accelerator: "CmdOrCtrl+R"
          },
          {
            label: "Toggle Developer Tools",
            accelerator: "Ctrl+Shift+I",
            id: "toggle-developer"
          }
        ]
      }
    ]
  },
  {
    label: "Help",
    submenu: [
      {
        id: "help-about",
        label: "About"
      },
      {
        id: "help-learn-more",
        label: "Learn More"
      },
      {
        type: "separator"
      },
      {
        id: "help-feedback",
        label: "Feedback"
      }
    ]
  }
]