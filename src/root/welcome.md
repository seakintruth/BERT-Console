
Welcome to the new BERT console!  The console includes an R command
shell and a basic editor for editing your function or script files.

A couple of key things to know:

 * BERT loads functions from the `functions.R` file.  To add your 
   own functions to Excel, either edit that file or (better yet) 
   add new files, and `source()` them in `functions.R`.

 * If you save a file in this editor, BERT will reload your R 
   functions into Excel.  If you want to do something more 
   complicated -- like recalculating your spreadsheet -- see the 
   docs on watching files.
 
 * The R shell is "live" and connected to Excel -- see the docs on 
   Talking to Excel from R, and the Excel Scripting (COM) Interface.

This editor, and the R command shell, are built using CodeMirror and
Electron.  This is a complicated stack but the end result should be 
very easy to use, configurable and extensible.  

You don't have to use our editor -- use any editor you like.  You
can hide this editor in the *View* menu, and just use the command
shell.

Have suggestions, feedback, questions, comments?  Let us know!  

Cheers,

 -- The BERT team
 