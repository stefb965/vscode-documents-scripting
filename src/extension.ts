'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';
import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as tsc from 'typescript-compiler';
import * as config from './config';


const open = require('open');
const urlExists = require('url-exists');


type script = {name, souceCode};


const SDS_TIMEOUT: number = 60 * 1000;

const QUICKPICK_UPLOAD:  string = 'Upload script to Server?';
const QUICKPICK_COMPILE: string = 'Compile and upload javascript to Server?';
const QUICKPICK_CANCEL:  string = 'Not now';
const QUICKPICK_NEVER:   string = 'Never in this session';

const OPERATION_UPLOAD:  string = 'uploadScript';




// make new class and set as parameter
let myOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('MyChannelName');
let loginData: config.LoginData;
let disposableOnSave: vscode.Disposable;





// hack
const DIFF_FOLDER = '_tmp';


export function activate(context: vscode.ExtensionContext) {

    loginData = new config.LoginData(myOutputChannel);
    if(!loginData) {
        myOutputChannel.append('Cannot activate vscode-documents-scripting');
        return;
    }
    context.subscriptions.push(loginData);


    // download all
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadAllScripts', (param) => {
            if(param) {
                connectAndCallOperation("downloadAllScripts", undefined, param._fsPath);
            } else {
                connectAndCallOperation("downloadAllScripts");
            }
        })
    );

    // download script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadScript', () => {
            connectAndCallOperation("downloadScript");
        })
    );

    // upload all
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadAllScripts', (param) => {
            if(param) {
                connectAndCallOperation("uploadAllScripts", undefined, param._fsPath);
            } else {
                connectAndCallOperation("uploadAllScripts");
            }
        })
    );

    // upload script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadScript', () => {
            connectAndCallOperation(OPERATION_UPLOAD);
        })
    );
    // upload script on save
    disposableOnSave = vscode.workspace.onDidSaveTextDocument(onDidSaveScript, this);
    context.subscriptions.push(disposableOnSave);

    // run script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.runScript', () => {
            connectAndCallOperation("runScript");
        })
    );

    // save configuration
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.saveConfiguration', () => {
            if(loginData) {
                loginData.inputProcedure();
            }
        })
    );

    // // load configuration
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('extension.loadConfiguration', () => {
    //         if(iniData) {
    //             iniData.loadConfiguration();
    //         }
    //     })
    // );

    // // clear configuration
    // context.subscriptions.push(
    //     vscode.commands.registerCommand('extension.clearConfiguration', () => {
    //         if(iniData) {
    //             iniData.clearAllData(true);
    //         }
    //     })
    // );

    // view documentation
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.viewDocumentation', (file) => {
            // file is not used, use active editor...

            let portalscriptdocu = 'http://doku.otris.de/api/portalscript/';
            urlExists(portalscriptdocu, function(err, exists) {
                if(!exists) {
                    vscode.window.showInformationMessage('Documentation is not available!');
                } else {

                    // current editor
                    const editor = vscode.window.activeTextEditor;
                    if(!editor || !vscode.workspace.rootPath) {
                        return;
                    }

                    // skip import lines
                    var cnt = 0;
                    var currline:string = editor.document.lineAt(cnt).text;
                    while(currline.startsWith('import')) {
                        cnt ++;
                        currline = editor.document.lineAt(cnt).text;
                    }

                    // first line after import should look like "export class Context {"
                    var _words = currline.split(' ');
                    if(_words.length != 4 || _words[0] !== 'export' || _words[1] !== 'class' || _words[3] != '{') {
                        return;
                    }


                    var classname = _words[2];

                    // the Position object gives you the line and character where the cursor is
                    const pos = editor.selection.active;
                    if(!pos) {
                        return;
                    }
                    const line = editor.document.lineAt(pos.line).text;
                    const words = line.split(' ');
                    var member = '';

                    if(words[0].trim() === 'public') {
                        member = words[1].trim();
                        var brace = member.indexOf('(');
                        if(brace >= 0) {
                            member = member.substr(0, brace);
                        }
                    }

                    const jsFileName = 'class' + classname + '.js';
                    const htmlFileName = 'class' + classname + '.html';
                    const jsFilePath = path.join(vscode.workspace.rootPath, 'mapping', jsFileName);

                    fs.readFile(jsFilePath, (err, data) => {

                        var browser = 'firefox';
                        if(err || !data) {
                            var page = portalscriptdocu + htmlFileName;
                            open(page, browser);

                        } else {
                            // \r was missing in the generated files
                            var lines = data.toString().split("\n");

                            for(var i=2; i<lines.length-1; i++) {
                                var entries = lines[i].split(',');
                                if(entries.length < 2) {
                                    continue;
                                }
                                // entries[0] looks like: "     [ "clientId""
                                var entry = entries[0].replace('[','').replace(/"/g,'').trim();

                                if(entry === member) {
                                    // entries[1] looks like: "  "classContext.html#a6d644a063ace489a2893165bb3856579""
                                    var link = entries[1].replace(/"/g,'').trim();
                                    var page = portalscriptdocu + link;
                                    open(page, browser);
                                    break;
                                }
                            }
                            if(i === lines.length-1) {
                                var page = portalscriptdocu + htmlFileName;
                                open(page, browser);
                            }
                        }
                    });
                }
            });
        })
    );
    
    // compare script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.compareScript', (param) => {

            let filepath;

            if(param) {
                filepath = param._fsPath;
            } else {
                let editor = vscode.window.activeTextEditor;
                if (editor && editor.document) {
                    filepath = editor.document.fileName;
                }
            }

            if(!filepath) {
                vscode.window.showErrorMessage('Select or open a file to compare');
                return;
            } else {
                if('.js' === path.extname(filepath)) {
                    let filename = path.basename(filepath);
                    let leftfile = filepath;
                    if(vscode.workspace.rootPath) {
                        let rightfile = path.join(vscode.workspace.rootPath, DIFF_FOLDER, filename);
                        let lefturi = vscode.Uri.file(leftfile);
                        let righturi = vscode.Uri.file(rightfile);
                        let title = 'Diff ' + filename;
                        vscode.commands.executeCommand('vscode.diff', lefturi, righturi, title).then(() => {
                        }, (reason) => {
                            vscode.window.showInformationMessage('View Diff is not yet available!');
                        });
                    }
                }
            }
        })
    );


    vscode.window.setStatusBarMessage('vscode-documents-scripting is active');
}



export function deactivate() {
    console.log('The extension is deactivated');
}





// load script automatically when script is saved
function onDidSaveScript(textDocument: vscode.TextDocument) {

    // javascript files
    if(textDocument.fileName.endsWith(".js")) {
        vscode.window.showQuickPick([QUICKPICK_UPLOAD, QUICKPICK_CANCEL, QUICKPICK_NEVER]).then((value) => {
            if(QUICKPICK_UPLOAD === value) {
                connectAndCallOperation(OPERATION_UPLOAD, textDocument);
            }
            if(QUICKPICK_NEVER === value) {
                disposableOnSave.dispose();
            }
        });
    }


    // typescript files
    if(textDocument.fileName.endsWith(".ts")) {
        vscode.window.showQuickPick([QUICKPICK_COMPILE, QUICKPICK_CANCEL, QUICKPICK_NEVER]).then((value) => {
            if(QUICKPICK_COMPILE === value) {
                connectAndCallOperation(OPERATION_UPLOAD, textDocument);
            }
            if(QUICKPICK_NEVER === value) {
                disposableOnSave.dispose();
            }
        });
    }

}


function getActivePath(): string {
    console.log('IniData.getActivePath');

    // first check current opened file?
    let editor = vscode.window.activeTextEditor;
    if (editor && editor.document) {
        let file = editor.document.fileName;
        const parsedPath = path.parse(file);
        return parsedPath.dir;
    }

    // if there's no file, return opened folder path
    return vscode.workspace.rootPath;
}




async function askForDownloadPath(parampath?: string): Promise<string> {
    console.log('IniData.askForDownloadPath');

    return new Promise<string>((resolve, reject) => {
        if(parampath) {
            let _path = parampath;
            if(path.extname(parampath)) {
                _path = path.dirname(parampath);
            }
            resolve(_path);
        } else {
            let activePath = getActivePath();
            let rootPath = vscode.workspace? vscode.workspace.rootPath:'';
            let defaultPath: string = activePath? activePath: rootPath;
            vscode.window.showInputBox({
                prompt: 'Please enter the download path',
                value: defaultPath,
                ignoreFocusOut: true,
            }).then((_path) => {
                if(_path) {
                    if(!_path.startsWith(rootPath)) {
                        if(_path.startsWith(path.sep)) {
                            resolve(path.join(vscode.workspace.rootPath, _path));
                        } else {
                            vscode.window.showErrorMessage('Path is not a subfolder');
                            reject();
                        }
                    } else {
                        resolve(_path);
                    }
                } else {
                    vscode.window.showErrorMessage('Input download path cancelled: command cannot be executed');
                    reject();
                }
            });
        }
    });
}


async function ensureUploadPath(uploadpath?: string): Promise<string> {
    console.log('ensureUploadPath');
    return new Promise<string>((resolve, reject) => {
        let rootPath = vscode.workspace? vscode.workspace.rootPath:'';
        if(uploadpath) {
            let _path = uploadpath;
            if(path.extname(uploadpath)) {
                _path = path.dirname(uploadpath);
            }
            if(!_path.startsWith(rootPath)) {
                reject();
                vscode.window.showErrorMessage('Path is not a subfolder');
            } else {
                resolve(_path);
            }
        } else {
            let activePath = getActivePath();
            vscode.window.showInputBox({
                prompt: 'Please enter the upload path',
                value: activePath,
                ignoreFocusOut: true,
            }).then((_path) => {
                if(_path) {
                    if(!_path.startsWith(rootPath)) {
                        reject();
                        vscode.window.showErrorMessage('Path is not a subfolder');
                    } else {
                        resolve(_path);
                    }
                } else {
                    reject();
                }
            });
        }
    });
}

async function ensureScriptName(): Promise<string> {
    console.log('ensureScriptName');
    return new Promise<string>((resolve, reject) => {
        let scriptName = '';
        let editor = vscode.window.activeTextEditor;
        if(editor) {
            let activeScript = editor.document.fileName;
            scriptName = path.basename(activeScript, '.js');
        }
        vscode.window.showInputBox({
            prompt: 'Please enter the script name or path',
            value: scriptName,
            ignoreFocusOut: true,
        }).then((_scriptname) => {
            if(_scriptname) {
                let scriptname = path.basename(_scriptname, '.js');
                resolve(scriptname);
            } else {
                reject();
            }
        });
    });
}



function connectAndCallOperation(operation: string, textDocument?: vscode.TextDocument, parampath?: string) {

    if(!loginData) {
        return;
    }

    loginData.ensureLoginData().then(() => {
        console.log('ensureLoginData successful');

        // create socket
        let sdsSocket = connect(loginData.port, loginData.server);


        // implement callback functions for the socket
        // actual function (callOperation) is in the callback function "socket.on(connect)"

        sdsSocket.on('connect', () => {
            console.log('callback socket.on(connect)...');

            doLogin(sdsSocket).then((sdsConnection) => {
                // switchOperation() and closeConnection() are both called inside doLogin.then()
                // because both need parameter sdsConnection
                
                // call switchOperation() and then close the connection in any case
                switchOperation(sdsConnection, operation, textDocument, parampath).then(() => {
                    closeConnection(sdsConnection).catch((reason) => {
                        console.log(reason);
                    });
                }).catch((reason) => {
                    console.log(reason);
                    closeConnection(sdsConnection); // => check socket-on-close
                });

            }).catch((reason) => {
                console.log(reason);
            });
        });

        sdsSocket.on('close', (hadError: boolean) => {
            console.log('callback socket.on(close)...');
            if (hadError) {
                console.log('remote closed SDS connection due to error');
            }
            else {
                console.log('remote closed SDS connection');
            }
        });

        sdsSocket.on('error', (err: any) => {
            console.log('callback socket.on(error)...');
            console.log(err);
            vscode.window.showErrorMessage('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
        });

    }).catch((reason) => {
        console.log('ensureLoginData failed: ' + reason);
    });
}







async function switchOperation(sdsConnection: SDSConnection,
                               operation: string,
                               textDocument?: vscode.TextDocument,
                               parampath?: string,
                               paramscript?: string): Promise<void> {

    if(OPERATION_UPLOAD === operation) {
        // todo move vscode.window.setStatusBarMessage here
        return uploadActiveScript(sdsConnection, textDocument);
    }
    else if('downloadAllScripts' === operation) {
        return new Promise<void>((resolve, reject) => {
            askForDownloadPath(parampath).then((_path) => {
                if(_path) {
                    return getScriptNamesFromServer(sdsConnection).then((scriptNames) => {
                        return reduce(scriptNames, function(numscripts, name) {
                            return downloadScript(sdsConnection, name, _path).then(() => {
                                return numscripts + 1;
                            });
                        }, 0).then((numscripts) => {
                            vscode.window.setStatusBarMessage('downloaded ' + numscripts + ' scripts');
                            resolve();
                        });
                    });
                }
            });
        });
    }
    else if('downloadScript' === operation) {
        return new Promise<void>((resolve, reject) => {
            ensureScriptName().then((scriptname) => {
                askForDownloadPath().then((_path) => {
                    if(_path) {
                        downloadScript(sdsConnection, scriptname, _path).then(() => {
                            vscode.window.setStatusBarMessage('downloaded: ' + scriptname);
                            resolve();
                        }).catch((reason) => {
                            reject(reason);
                        });
                    }
                });
            });
        });
    }
    else if('runScript' === operation) {
        // todo move vscode.window.setStatusBarMessage here
        return runScript(sdsConnection);
    }
    else if('uploadAllScripts' === operation) {
        return new Promise<void>((resolve, reject) => {
            ensureUploadPath(parampath).then((folder) => {
                return getScriptsFromFolder(folder).then((scripts) => {
                    console.log('scripts: ' + scripts.length);
                    //console.log('scripts[0].souceCode: ' + scripts[0].souceCode);

                    return reduce(scripts, function(numscripts, _script) {
                        return uploadScript(sdsConnection, _script.name, _script.souceCode).then(() => {
                            return numscripts + 1;
                        });
                    }, 0).then((numscripts) => {
                        vscode.window.setStatusBarMessage('uploaded ' + numscripts + ' scripts');
                        resolve();
                    });
                });
            }).catch((reason) => {
                reject('uploadAllScripts failed:' + reason);
            });
        });
    }
    // else if...
    else {
        return new Promise<void>((resolve, reject) => {
            reject('switchOperation: unknown operation: ' + operation);
        });
    }
}




// get script names from server
// todo new function get script names from folder
async function getScriptNamesFromServer(sdsConnection: SDSConnection): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
            resolve(scriptNames);
        }).catch((reason) => {
            reject("getScriptNames() failed: " + reason);
        });
    });
}




async function getScriptsFromFolder(_path: string): Promise<script[]> {
    return new Promise<script[]>((resolve, reject) => {
    
        let scripts : script[] = [];

        fs.readdir(_path, function (err, files) {
            if (err) {
                console.log('err in readdir: ' + err);
                reject();
            }
            if (!files) {
                console.log('err in readdir: ' + err);
                reject();
            }

            files.map(function (file) {
                return path.join(_path, file);
            }).filter(function (file) {
                return fs.statSync(file).isFile();
            }).forEach(function (file) {
                if('.js' === path.extname(file)) {
                    try {
                        let sc = fs.readFileSync(file, 'utf8');
                        let _name = path.basename(file, '.js');
                        scripts.push({name: _name, souceCode: sc});
                        //console.log('script added: ' + _name);
                    } catch(err) {
                        console.log('catch in readFileSync: ' + err);
                        reject();
                    }
                }
            });

            resolve(scripts);
        });
    });
}



async function downloadScript(sdsConnection: SDSConnection, scriptName: string, parampath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.downloadScript", [scriptName]).then((scriptSource) => {
            if('' === parampath) {
                reject("path missing");
            } else {
                let lines = scriptSource[0].split('\n');
                if(lines.length > 1) {
                    if(lines[0].startsWith("// var context = require(") || lines[0].startsWith("// var util = require(") ) {
                        lines[0] = lines[0].replace('// ', '');
                    }
                    if(lines[1].startsWith("// var context = require(") || lines[1].startsWith("// var util = require(") ) {
                        lines[1] = lines[1].replace('// ', '');
                    }
                }
                scriptSource[0] = lines.join('\n');



                let scriptPath = path.join(parampath, scriptName + ".js");
                fs.writeFile(scriptPath, scriptSource[0], {encoding: 'utf8'}, function(error) {
                    if(error) {
                        if(error.code === "ENOENT") {
                            fs.mkdir(parampath, function(error) {
                                if(error) {
                                    reject(error);
                                } else {
                                    console.log("created path: " + parampath);
                                    fs.writeFile(scriptPath, scriptSource[0], {encoding: 'utf8'}, function(error) {
                                        if(error) {
                                            reject(error);
                                        } else {
                                            console.log("downloaded script: " +  scriptPath);
                                            resolve();
                                        }
                                    });
                                }
                            });
                        } else {
                            reject(error);
                        }
                    } else {
                        console.log("downloaded script: " +  scriptPath);
                        resolve();
                    }
                });
            }
        }).catch((reason) => {
            reject("downloadScript(" + scriptName + ") failed: " + reason);
        });
    });
}





async function uploadScript(sdsConnection: SDSConnection, shortName: string, scriptSource: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let lines = scriptSource.split('\n');
        if(lines.length > 1) {
            if(lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(") ) {
                lines[0] = '// ' + lines[0];
            }
            if(lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(") ) {
                lines[1] = '// ' + lines[1];
            }
        }
        scriptSource = lines.join('\n');
        sdsConnection.callClassOperation("PortalScript.uploadScript", [shortName, scriptSource], true).then((value) => {
            console.log('uploaded shortName: ', shortName);
            resolve();
        }).catch((reason) => {
            reject(OPERATION_UPLOAD + '(): sdsConnection.callClassOperation failed: ' + reason);
        });
    });
}





async function uploadActiveScript(sdsConnection: SDSConnection, textDocument?: vscode.TextDocument): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let doc;

        // get document
        if(textDocument) {
            doc = textDocument;
        } else {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                doc = editor.document;
            }
        }
        if(!doc) {
            vscode.window.showErrorMessage('Open the script and upload again');
            resolve();
        } else {
            let shortName = '';
            let scriptSource = '';

            if(doc.fileName.endsWith('.js')) {
                shortName = path.basename(doc.fileName, '.js');
                scriptSource = doc.getText();

            } else if(doc.fileName.endsWith('.ts')) {
                shortName = path.basename(doc.fileName, '.ts');
                let tsname:string = doc.fileName;
                let jsname:string = tsname.substr(0, tsname.length - 3) + ".js";
                //let tscargs = ['--module', 'commonjs', '-t', 'ES6'];
                let tscargs = ['-t', 'ES5', '--out', jsname];
                let retval = tsc.compile([doc.fileName], tscargs, null, function(e) { console.log(e); });
                scriptSource = retval.sources[jsname];
                console.log("scriptSource: " + scriptSource);

            } else {
                reject(OPERATION_UPLOAD + '(): only javascript or typescript files');
            }
        
            let lines = scriptSource.split('\n');
            if(lines.length > 1) {
                if(lines[0].startsWith("var context = require(") || lines[0].startsWith("var util = require(") ) {
                    lines[0] = '// ' + lines[0];
                }
                if(lines[1].startsWith("var context = require(") || lines[1].startsWith("var util = require(") ) {
                    lines[1] = '// ' + lines[1];
                }
            }
            scriptSource = lines.join('\n');
            uploadScript(sdsConnection, shortName, scriptSource).then((value) => {
                vscode.window.setStatusBarMessage('uploaded: ' + shortName);
                resolve();
            }).catch((reason) => {
                reject(reason);
            });
        }
    });
}





async function runScript(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let editor = vscode.window.activeTextEditor;
        if (editor && editor.document.fileName.endsWith(".js")) {
            let doc = editor.document;

            // todo
            // let scriptPath = doc.fileName;
            // let NameStart = scriptPath.lastIndexOf(path.sep) + 1;
            // let NameLength = scriptPath.lastIndexOf(".") - NameStart;
            // let shortName = scriptPath.substr(NameStart, NameLength);
            let shortName = path.basename(doc.fileName, '.js');
            
            sdsConnection.callClassOperation("PortalScript.runScript", [shortName]).then((value) => {
                vscode.window.setStatusBarMessage('runScript: ' + shortName);
                for(let i=0; i<value.length; i++) {
                    console.log("returnValue " + i + ": " + value[i]);
                    myOutputChannel.append(value[i] + os.EOL);
                    myOutputChannel.show();
                }
                resolve();
            }).catch((reason) => {
                reject("runScript(): sdsConnection.callClassOperation failed: " + reason);
            });
        } else {
            // silently ignore
        }
    });
}


async function doLogin(sdsSocket: Socket): Promise<SDSConnection> {
    return new Promise<SDSConnection>((resolve, reject) => {
        let sdsConnection = new SDSConnection(sdsSocket);
        sdsConnection.timeout = SDS_TIMEOUT;

        sdsConnection.connect('vscode-documents-scripting').then(() => {
            console.log('connect successful');
            let username = loginData.username;
            if('admin' !== loginData.username) {
                username += "." + loginData.principal;
            }

            return sdsConnection.changeUser(username, getJanusPassword(loginData.password));

        }).then(userId => {
            console.log('changeUser successful');
            if (loginData.principal.length > 0) {
                return sdsConnection.changePrincipal(loginData.principal);
            } else {
                reject('doLogin(): please set principal');
            }

        }).then(() => {
            console.log('changePrincipal successful');
            resolve(sdsConnection);

        }).catch((reason) => {
            reject('doLogin() failed: ' + reason);
            closeConnection(sdsConnection).catch((reason) => {
                console.log(reason);
            });
        });
    });
}


async function closeConnection(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.disconnect().then(() => {
            resolve();
        }).catch((reason) => {
            reject("closeConnection: " + reason);
        });
    });
}
