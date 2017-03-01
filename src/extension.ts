'use strict';

import * as fs from 'fs';
import { parse, ParsedPath, sep } from 'path';
import * as vscode from 'vscode';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';
import { SDSConnection, Hash, crypt_md5 } from 'node-sds';
import * as tsc from 'typescript-compiler';
import * as config from './config';


const SALT: string = 'o3';
const SDS_TIMEOUT: number = 60 * 1000;

const QUICKPICK_UPLOAD:  string = 'Upload script to Server?';
const QUICKPICK_COMPILE: string = 'Compile and upload javascript to Server?';
const QUICKPICK_CANCEL:  string = 'Not now';
const QUICKPICK_NEVER:   string = 'Never in this session';

const OPERATION_UPLOAD:  string = 'uploadScript';




// make new class and set as parameter
let myOutputChannel = vscode.window.createOutputChannel('MyChannelName');
let iniData;
let disposableOnSave;



export function activate(context: vscode.ExtensionContext) {
    vscode.window.setStatusBarMessage('vscode-documents-scripting is active');

    iniData = new config.IniData();
    context.subscriptions.push(iniData);

    // download all
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadAllScripts', () => {
            connectAndCallOperation("downloadAllScripts");
        })
    );

    // upload script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadScript', () => {
            connectAndCallOperation(OPERATION_UPLOAD);
        })
    );
    disposableOnSave = vscode.workspace.onDidSaveTextDocument(onDidSaveScript, this);
    context.subscriptions.push(disposableOnSave);

    // run script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.runScript', () => {
            connectAndCallOperation("runScript");
        })
    );

    // change login data
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.changeLoginData', () => {
            vscode.window.setStatusBarMessage('changeLoginData is coming soon');
        })
    );

    // change download path
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.changeDownloadPath', () => {
            vscode.window.setStatusBarMessage('changeDownloadPath is coming soon');
        })
    );


    // add: on-close-vscode: want to save loginData and downloadpath to default.ini?
}

export function deactivate() {
    console.log("The extension is deactivated");
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








function connectAndCallOperation(operation: string, textDocument?: vscode.TextDocument) {

    if(!iniData) {
        return;
    }

    iniData.ensureLoginData().then(() => {

        // create socket
        let sdsSocket = connect(iniData.port, iniData.server);


        // implement callback functions for the socket
        // actual function (callOperation) is in the callback function "socket.on(connect)"

        sdsSocket.on('connect', () => {
            console.log("callback socket.on(connect)...");

            doLogin(sdsSocket).then((sdsConnection) => {
                // switchOperation() and closeConnection() are both called inside doLogin.then()
                // because both need parameter sdsConnection
                
                // call switchOperation() and then close the connection in any case
                switchOperation(sdsConnection, operation, textDocument).then(() => {
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
            console.log("callback socket.on(close)...");
            if (hadError) {
                console.log("remote closed SDS connection due to error");
            }
            else {
                console.log("remote closed SDS connection");
            }
        });

        sdsSocket.on('error', (err: any) => {
            console.log("callback socket.on(error)...");
            console.log("failed to connect to host: " + iniData.server + " and port: " + iniData.port);
            console.log(err);
        });

    }).catch((reason) => {
        console.log("ensureLoginData failed: " + reason);
    });
}


async function switchOperation(sdsConnection: SDSConnection, operation: string,  textDocument?: vscode.TextDocument): Promise<void> {

    if(OPERATION_UPLOAD === operation) {
        return uploadScript(sdsConnection, textDocument);
    }
    else if("downloadAllScripts" === operation) {
        return iniData.ensureDownloadPath().then(() => {
            return getScriptNames(sdsConnection).then((scriptNames) => {
                return reduce(scriptNames, function(numscripts, name) {
                    return downloadScript(sdsConnection, name).then(() => {
                        return numscripts + 1;
                    });
                }, 0).then((numscripts) => {
                    vscode.window.setStatusBarMessage("downloaded " + numscripts + " scripts");
                });
            });
        });
    }
    else if("runScript" === operation) {
        return runScript(sdsConnection);
    }
    // else if...
    else {
        return new Promise<void>((resolve, reject) => {
            reject("switchOperation: unknown operation: " + operation);
        });
    }
}





async function getScriptNames(sdsConnection: SDSConnection): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
            resolve(scriptNames);
        }).catch((reason) => {
            reject("getScriptNames() failed: " + reason);
        });
    });
}


async function downloadScript(sdsConnection: SDSConnection, scriptName: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.downloadScript", [scriptName]).then((scriptSource) => {
            if('' === iniData.localpath) {
                reject("localpath missing");
            }
            let scriptPath = iniData.localpath + "\\" + scriptName + ".js";
            fs.writeFile(scriptPath, scriptSource[0], {encoding: 'utf8'}, function(error) {
                if(error) {
                    if(error.code === "ENOENT") {
                        fs.mkdir(iniData.localpath, function(error) {
                            if(error) {
                                reject(error);
                            } else {
                                console.log("created path: " + iniData.localpath);
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
        }).catch((reason) => {
            reject("downloadScript(" + scriptName + ") failed: " + reason);
        });
    });
}


function getShortName(path: string): string{
    let NameStart = path.lastIndexOf("\\") + 1;
    let NameLength = path.lastIndexOf(".") - NameStart;
    let shortName = path.substr(NameStart, NameLength);
    return shortName;
}

async function uploadScript(sdsConnection: SDSConnection, textDocument?: vscode.TextDocument): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let doc;
        if(textDocument) {
            doc = textDocument;
        }
        else {
            let editor = vscode.window.activeTextEditor;
            if (!editor) {
                reject(OPERATION_UPLOAD + '(): editor undefined');
            }
            doc = editor.document;
        }
        if(!doc) {
            reject(OPERATION_UPLOAD + '(): text-document undefined');
        }



        let shortName = getShortName(doc.fileName);
        let scriptSource = '';


        if(doc.fileName.endsWith(".js")) {
            scriptSource = doc.getText();
        }
        else if(doc.fileName.endsWith(".ts")) {
            let tsname:string = doc.fileName;
            let jsname:string = tsname.substr(0, tsname.length - 3) + ".js";
            //let tscargs = ['--module', 'commonjs', '-t', 'ES6'];
            let tscargs = ['-t', 'ES5', '--out', jsname];
            let retval = tsc.compile([doc.fileName], tscargs, null, function(e) { console.log(e); });
            scriptSource = retval.sources[jsname];
            console.log("scriptSource: " + scriptSource);
        }
        else {
            reject(OPERATION_UPLOAD + '(): only javascript or typescript files');
        }

    

        sdsConnection.callClassOperation("PortalScript.uploadScript", [shortName, scriptSource], true).then((value) => {
            vscode.window.setStatusBarMessage('uploaded: ' + shortName);
            resolve();
        }).catch((reason) => {
            reject(OPERATION_UPLOAD + '(): sdsConnection.pdcCallOperation failed: ' + reason);
        });
    });
}


async function runScript(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            reject("runScript(): editor undefined");
        }
        if(!editor.document.fileName.endsWith(".js")) {
            reject("runScript(): only javascript files");
        }
        let doc = editor.document;

        // todo
        let scriptPath = doc.fileName;
        let NameStart = scriptPath.lastIndexOf("\\") + 1;
        let NameLength = scriptPath.lastIndexOf(".") - NameStart;
        let shortName = scriptPath.substr(NameStart, NameLength);
        
        sdsConnection.callClassOperation("PortalScript.runScript", [shortName]).then((value) => {
            vscode.window.setStatusBarMessage('runScript: ' + shortName);
            for(let i=0; i<value.length; i++) {
                console.log("returnValue " + i + ": " + value[i]);
                myOutputChannel.append(value[i] + "\n");
                myOutputChannel.show();
            }
            resolve();
        }).catch((reason) => {
            reject("runScript(): sdsConnection.callClassOperation failed: " + reason);
        });
    });
}


async function doLogin(sdsSocket: Socket): Promise<SDSConnection> {
    return new Promise<SDSConnection>((resolve, reject) => {
        let sdsConnection = new SDSConnection(sdsSocket);
        sdsConnection.timeout = SDS_TIMEOUT;

        sdsConnection.connect('vscode-documents-scripting').then(() => {

            console.log('connect successful');
            if('admin' == iniData.user) {
                return sdsConnection.changeUser(iniData.user, new Hash(iniData.password));
            } else {
                return sdsConnection.changeUser(iniData.user + "." + iniData.principal, crypt_md5(iniData.password, SALT));
            }

        }).then(userId => {

            console.log('changeUser successful');
            if (iniData.principal.length > 0) {
                return sdsConnection.changePrincipal(iniData.principal);
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
