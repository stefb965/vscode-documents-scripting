'use strict';

import * as fs from 'fs';
import { parse, ParsedPath, sep } from 'path';
import * as vscode from 'vscode';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';
import { SDSConnection, Hash } from 'node-sds';
import * as tsc from 'typescript-compiler';

const SDS_TIMEOUT: number = 60 * 1000;

const INI_NAME: string = 'default.ini';
const INI_CONN_PART: string = '[Connection]';
const INIPATH: string = '[INIPATH]';

var myOutputChannel = vscode.window.createOutputChannel('MyChannelName');



// todo spend another file...
class Config {
    // todo private + getter...
    
    // login data
    public server:string    = '';
    public port:number      = 0;
    public principal:string = '';
    public user:string      = '';
    public password:Hash    = new Hash('');

    // path for up- and download all
    public localpath:string = '';
    

    constructor () {
        //
    }

    public checkLoginData():boolean{
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.user) {
            return false;
        }
        return true;
    }

    public checkDownloadPath():boolean{
        if('' === this.localpath) {
            return false;
        }
        return true;
    }

    async askForDownloadPath(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: 'Please enter the download path',
                ignoreFocusOut: true,
            }).then((localpath) => {
                this.localpath = localpath;
                resolve();
            });
        });
    }

    async ensureDownloadPath(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if(this.checkDownloadPath()) {
                resolve();
            }
            else if(this.loadIniFile() && this.checkDownloadPath()) {
                resolve();
            }
            else {
                this.askForDownloadPath().then(() => {
                    resolve();
                });
            }
        });
    }
    

    async askForLoginData(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: 'Please enter the server',
                ignoreFocusOut: true,
            }).then((server) => {
                config.server = server;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the port',
                    ignoreFocusOut: true,
                });
            }).then((port) => {
                config.port = port;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the principal',
                    ignoreFocusOut: true,
                });
            }).then((principal) => {
                config.principal = principal;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the user',
                    ignoreFocusOut: true,
                });
            }).then((user) => {
                config.user = user;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the password',
                    password: true,
                    ignoreFocusOut: true,
                });
            }).then((password) => {
                config.password = new Hash(password);
                resolve();
            });
        });
    }

    async ensureLoginData(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if(this.checkLoginData()) {
                resolve();
            }
            else if(this.loadIniFile() && this.checkLoginData()) {
                resolve();
            }
            else {
                this.askForLoginData().then(() => {
                    resolve();
                });
            }
        });
    }


    public iniFile:string   = '';
    public iniPath:string   = '';
    
    public loadIniFile(): boolean {
        let path = this.getActivePath();
        let file = this.findIni(path);
        if(!file) {
            return false;
        }

        this.iniPath = path;
        this.iniFile = file;

        let contentBuf = fs.readFileSync(file, 'utf8');
        let contentStr = contentBuf.toString();
        let lines = contentStr.split("\r\n");
        if(INI_CONN_PART === lines[0]) {
            for(let i=1; i<lines.length; i++) {
                let line = lines[i].split("=");
                if(this[line[0]] != undefined) {
                    switch(line[0]) {
                        case 'password':
                            this[line[0]] = new Hash(line[1]);
                            break;
                        case 'localpath':
                            if(INIPATH === line[1]) {
                                this[line[0]] = this.iniPath;
                            } else {
                                this[line[0]] = line[1];
                            }
                            break;
                        default:
                            this[line[0]] = line[1];
                    }
                    console.log(line[0] + ": " + line[1]);
                }
            }
        }
        return true;
    }

    public getActivePath():string
    {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        let file = editor.document.fileName;
        const parsedPath = parse(file);
        return parsedPath.dir;
    }

    public findIni(path: string):string
    {
        if(!path) {
            return null;
        }

        const ini = path + '\\' + INI_NAME;
        try {
            fs.accessSync(ini);
            return ini;
        } catch (e) {
            return null;
        }
    }
}







let config;
let disposableOnSave;

export function activate(context: vscode.ExtensionContext)
{
    vscode.window.setStatusBarMessage('vscode-documents-scripting is active');

    config = new Config();

    let disposable1 = vscode.commands.registerCommand('extension.downloadAllScripts', () => {
        callOperationOnServer("downloadAllScripts");
    });

    let disposable2 = vscode.commands.registerCommand('extension.uploadScript', () => {
        callOperationOnServer("uploadScript");
    });
    disposableOnSave = vscode.workspace.onDidSaveTextDocument(onDidSaveScript, this);

    let disposable3 = vscode.commands.registerCommand('extension.runScript', () => {
        callOperationOnServer("runScript");
    });

    context.subscriptions.push(config);
    context.subscriptions.push(disposable1);
    context.subscriptions.push(disposable2);
    context.subscriptions.push(disposable3);
    context.subscriptions.push(disposableOnSave);
}

// load script automatically when script is saved
function onDidSaveScript(textDocument: vscode.TextDocument)
{
    if(textDocument.fileName.endsWith(".js")) {
        let upload = 'Upload script to PortalServer?';
        let cancel = 'Not now';
        let never  = 'Never in this session';
        vscode.window.showQuickPick([upload, cancel, never]).then((value) => {
            if(upload === value) {
                callOperationOnServer("uploadScript", textDocument);
            }
            if(never === value) {
                disposableOnSave.dispose();
            }
        });
    }
    if(textDocument.fileName.endsWith(".ts")) {
        let upload = 'Compile and upload javascript to PortalServer?';
        let cancel = 'Not now';
        let never  = 'Never in this session';
        vscode.window.showQuickPick([upload, cancel, never]).then((value) => {
            if(upload === value) {
                callOperationOnServer("uploadScript", textDocument);
            }
            if(never === value) {
                disposableOnSave.dispose();
            }
        });
    }

}

export function deactivate() {
    console.log("The extension is deactivated")
}







function callOperationOnServer(operation: string, textDocument?: vscode.TextDocument) {

    if(!config) {
        return;
    }

    config.ensureLoginData().then(() => {

        // create socket
        let sdsSocket = connect(config.port, config.server);


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
                    closeConnection(sdsConnection).catch((reason) => {
                        // sds sends no response to disconnect
                        // todo:
                        // parse reason, console.log(reason);
                        // check here if socket.on(close) has been executed
                    });
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
            console.log("failed to connect to host: " + config.server + " and port: " + config.port);
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
        return config.ensureDownloadPath().then(() => {
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
            if('' === config.localpath) {
                reject("no localpath");
            }
            let scriptPath = config.localpath + "\\" + scriptName + ".js";
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

        sdsConnection.connect().then(() => {

            // connect successful
            return sdsConnection.changeUser(config.user,  config.password);
        }).catch((reason) => {

            // connect failed
            reject("doLogin(): connectSDS failed: " + reason);
        }).then(userId => {

            // connect and change user successful
            if (config.principal.length > 0) {
                return sdsConnection.changePrincipal(config.principal);
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
