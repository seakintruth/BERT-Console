
Welcome to the new BERT console!  As you can see, it includes an 
editor as well.  This isn't full-featured, so we still encourage 
you to use external editors -- but it can be handy.

A couple of key things to know:

 * If you save a file in this editor, BERT will reload the startup
   file. If you want to do something more complicated -- like 
   recalculating the spreadsheet -- see the docs on watching files.
 
 * The R shell is "live" and connected to Excel -- see the docs on 
   talking to Excel from R, and the Excel scripting (COM) interface.

 * BERT loads functions from the `functions.R` file.  To add your 
   own functions to Excel, either edit that file or (better yet) 
   add new files, and `source()` them in `functions.R`.

This editor, and the R command shell, are built on CodeMirror, 
electron, and node.js.  This is a complicated stack but the end 
result should be very easy to use, configurable and extensible.

Have suggestions, feedback, questions, comments?  Let us know!  

Cheers,

 -- The BERT team
 