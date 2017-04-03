# Test Cases

## Command Palette

1. Download scripts to folder (folder, new folder)
2. Download script (sriptname, folder, new folder)
3. Upload scripts from folder (folder)
4. Upload script (script, folder)
5. Run script (scriptname)

* script
    * positive: valid path
    * negative: invalid path
* scriptname
    * positive: scriptname existing on server
    * negative: scriptname not existing on server
* folder
    * positive: absolute
    * negative: path not in root, relative path
* new folder
    * positive: absolute with new subfolder
    * negative: absolute with new subfolder/subfolder, incorrect foldername, path not in root, relative path

## Context-Menus

## Events

* Save script

## Keys

* Run script
