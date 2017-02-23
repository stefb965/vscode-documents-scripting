'use strict';

import * as fs from 'fs';
import { parse, ParsedPath, sep } from 'path';
import * as vscode from 'vscode';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';
import { SDSConnection, Hash } from 'node-sds';
import * as tsc from 'typescript-compiler';
import * as config from './config';



const SDS_TIMEOUT: number = 60 * 1000;




// make new class and set as parameter
var myOutputChannel = vscode.window.createOutputChannel('MyChannelName');
let iniData;
let disposableOnSave;



export function activate(context: vscode.ExtensionContext)
{
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
            connectAndCallOperation("uploadScript");
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
    console.log("The extension is deactivated")
}





// load script automatically when script is saved
function onDidSaveScript(textDocument: vscode.TextDocument)
{

    // javascript files
    if(textDocument.fileName.endsWith(".js")) {
        let upload = 'Upload script to Server?';
        let cancel = 'Not now';
        let never  = 'Never in this session';
        vscode.window.showQuickPick([upload, cancel, never]).then((value) => {
            if(upload === value) {
                connectAndCallOperation("uploadScript", textDocument);
            }
            if(never === value) {
                disposableOnSave.dispose();
            }
        });
    }


    // typescript files
    if(textDocument.fileName.endsWith(".ts")) {
        let upload = 'Compile and upload javascript to Server?';
        let cancel = 'Not now';
        let never  = 'Never in this session';
        vscode.window.showQuickPick([upload, cancel, never]).then((value) => {
            if(upload === value) {
                connectAndCallOperation("uploadScript", textDocument);
            }
            if(never === value) {
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

    if("uploadScript" === operation) {
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
                reject("no localpath");
            }
            let scriptPath = iniData.localpath + "\\" + scriptName + ".js";
            fs.writeFile(scriptPath, scriptSource[0], {encoding: 'utf8'}, function(error) {
                if(error) {
                    reject(error);
                }
            });
            console.log("downloaded script: " +  scriptPath);
            resolve();
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
                reject("uploadScript(): editor undefined");
            }
            doc = editor.document;
        }
        if(!doc) {
            reject("uploadScript(): text-document undefined");
        }



        let shortName = getShortName(doc.fileName);
        let scriptSource = '';


        if(doc.fileName.endsWith(".js")) {
            scriptSource = doc.getText();
        }
        else if(doc.fileName.endsWith(".ts")) {
            let tsname:string = doc.fileName;
            let jsname:string = tsname.substr(0, tsname.length - 3) + ".js";
            //let tscargs = ['--module', 'commonjs', '-t', 'ES5'];
            let tscargs = ['-t', 'ES6', '--out', jsname];
            let retval = tsc.compile([doc.fileName], tscargs, null, function(e) { console.log(e) });
            scriptSource = retval.sources[jsname];
            console.log("scriptSource: " + scriptSource);
        }
        else {
            reject("uploadScript(): only javascript or typescript files");
        }

    

        sdsConnection.callClassOperation("PortalScript.uploadScript", [shortName, scriptSource], true).then((value) => {
            vscode.window.setStatusBarMessage('uploaded: ' + shortName);
            resolve();
        }).catch((reason) => {
            reject("uploadScript(): sdsConnection.pdcCallOperation failed: " + reason);
        });
    });
}


async function runScript(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) 
        {
            reject("uploadScript(): editor undefined");
        }
        if(!editor.document.fileName.endsWith(".js"))
        {
            reject("uploadScript(): only javascript files");
        }
        let doc = editor.document;

        // todo
        let scriptPath = doc.fileName;
        let NameStart = scriptPath.lastIndexOf("\\") + 1;
        let NameLength = scriptPath.lastIndexOf(".") - NameStart;
        let shortName = scriptPath.substr(NameStart, NameLength);
        
        sdsConnection.callClassOperation("PortalScript.runScript", [shortName]).then((value) => {
            vscode.window.setStatusBarMessage('runScript: ' + shortName);
            for(let i=0; i<value.length; i++)
            {
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

            // connect successful
            return sdsConnection.changeUser(iniData.user,  iniData.password);
        }).catch((reason) => {

            // connect failed
            reject("doLogin(): connectSDS failed: " + reason);
        }).then(userId => {

            // connect and change user successful
            if (iniData.principal.length > 0) {
                return sdsConnection.changePrincipal(iniData.principal);
            }
            else{
                reject("doLogin(): please set principal");
            }
        }).catch((reason) => {
            
            // change user failed
            reject("doLogin(): changeUser failed: " + reason);
            closeConnection(sdsConnection).catch((reason) => {
                console.log(reason);
            });
        }).then(() => {
            
            // connect, change user and change principal successful
            resolve(sdsConnection);
        }).catch((reason) => {
            
            // change principal failed
            reject("doLogin(): changePrincipal failed: " + reason);
            closeConnection(sdsConnection).catch((reason) => {
                console.log(reason);
            });
        })
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
