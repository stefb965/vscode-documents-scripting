# DOCUMENTS Scripting

DOCUMENTS Scripting is an extension for the Source Code Editor Visual Studio Code. In order to create, edit and execute JavaScript files on a Documents-Server with Visual Studio Code this extension provides the following features:
* Up- and downloading JavaScript files to and from a DOCUMENTS-Server.
* Running JavaScript files on a DOCUMENTS-Server.

Please note: This extension is still a prototype. Additional features like comparison of local scripts with scripts on the server or IntelliSense will soon be integrated. Please refer to https://github.com/otris/vscode-documents-scripting/issues for submitting suggestions, wishes or bugs. 


## Requirements

You need a DOCUMENTS 5.0b server.

## Release Notes

You'll find a complete list of changes at our project site on [GitHub](https://github.com/otris/vscode-documents-scripting).

### 1.0.4

Initial public version.

### 1.0.5

* Extend context menu entries.
* Improve error handling.

### 1.0.6

* Add compare script.

### 1.0.7

* Handle encrypted scripts.
* Scripts can be uploaded automatically. Upload mode can be saved for every script separately.

### 1.0.8

* Only fixes.

### 1.0.9

* Insert conflictMode-list in settings.json. Before a script from this list is uploaded, the
state of the server script is checked. If the server script has been changed since last up-
or download, the user can decide to cancel the upload.

### 1.0.10

* Workaround for downloading selected scripts.


## Known Issues


## Troubleshooting

If something doesn't work, please try to reproduce the issue and file a bug [here](https://github.com/otris/vscode-documents-scripting/issues) if it is not already known. Please remember to

- Include the version you are using in the report.
- Tell us which server application you are using and on what OS that server is running.
- Include any logs, if possible.


## Legal Notice
This Visual Studio Code extension is developed by otris software AG and was initially released in March 2017. It is licensed under the MIT License, (see [LICENSE file](LICENSE)).


## About otris software AG
As a software-based data and document management specialist, otris software AG supports company decision-makers in realising management responsibilities. The solutions from otris software are available for this purpose. They can be used track, control and document all administrative processes completely and with full transparency. otris software is based in Dortmund, Germany. 
