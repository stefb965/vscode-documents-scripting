'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import * as reduce from 'reduce-for-promises';
import * as tsc from 'typescript-compiler';
import * as nodeDoc from 'node-documents-scripting';


const open = require('open');
const urlExists = require('url-exists');


const initialConfigurations = [
    {
        name: 'Launch Script on Server',
        request: 'launch',
        type: 'janus',
        script: '',
        username: '',
        password: '',
        principal: '',
        host: 'localhost',
        applicationPort: 11000,
        debuggerPort: 8089,
        stopOnEntry: false,
        log: {
            fileName: '${workspaceRoot}/vscode-janus-debug-launch.log',
            logLevel: {
                default: 'Debug',
            },
        },
    },
    {
        name: 'Attach to Server',
        request: 'attach',
        type: 'janus',
        host: 'localhost',
        debuggerPort: 8089,
        log: {
            fileName: '${workspaceRoot}/vscode-janus-debug-attach.log',
            logLevel: {
                default: 'Debug',
            },
        },
    },
];





// like eclipse plugin
const COMPARE_FOLDER = '.compare';
const COMPARE_FILE_PREF = 'compare_';

const CREATE_LAUNCHJSON = 'Please activate or create launch.json first';


export function activate(context: vscode.ExtensionContext) {

    let myOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('MyChannelName');

    // login data...

    // object loginData should be deleted on deactivation
    let launchjson;
    if(vscode.workspace) {
        launchjson = path.join(vscode.workspace.rootPath, '.vscode', 'launch.json');
    }
    let loginData: nodeDoc.LoginData = new nodeDoc.LoginData(launchjson);
    loginData.getLoginData = createLoginData;
    context.subscriptions.push(loginData);


    // register commands...


    // ----------------------------------------------------------
    //             Upload Script
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadScript', (param) => {
            let _param;
            if (param) {
                _param = param._fsPath;
            }
            ensureScript(_param).then((_script) => {
                let params = [_script.name, _script.sourceCode];
                return nodeDoc.sdsSession(loginData, params, nodeDoc.uploadScript).then((value) => {
                    let scriptname = value[0];
                    vscode.window.setStatusBarMessage('uploaded: ' + scriptname);
                });
            }).catch((reason) => {
                vscode.window.showErrorMessage('upload script failed: ' + reason);
            });
            
        })
    );



    // ----------------------------------------------------------
    //             Upload Script On Save
    // ----------------------------------------------------------
    if(vscode.workspace) {
        let disposableOnSave: vscode.Disposable;
        disposableOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {

            const UPLOAD:  string = 'Upload script to Server?';
            const CANCEL:  string = 'Not now';
            const NEVER:   string = 'Never in this session';

            // javascript files
            if('.js' === path.extname(textDocument.fileName)) {
                vscode.window.showQuickPick([UPLOAD, CANCEL, NEVER]).then((value) => {
                    if(UPLOAD === value) {
                        ensureScript(textDocument.fileName).then((_script) => {
                            let params = [_script.name, _script.sourceCode];
                            return nodeDoc.sdsSession(loginData, params, nodeDoc.uploadScript).then((value) => {
                                let scriptname = value[0];
                                vscode.window.setStatusBarMessage('uploaded: ' + scriptname);
                            });
                        }).catch((reason) => {
                            vscode.window.showErrorMessage('upload script failed: ' + reason);
                        });
                    } else if(NEVER === value) {
                        disposableOnSave.dispose();
                    }
                });
            }

            // typescript files
            // const COMPILE: string = 'Compile and upload javascript to Server?';
            // else if(textDocument.fileName.endsWith(".ts")) {
            //     vscode.window.showQuickPick([COMPILE, CANCEL, NEVER]).then((value) => {
            //     });
            // }

        }, this);
        context.subscriptions.push(disposableOnSave);
    }
    
    
    // ----------------------------------------------------------
    //             Download Script
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadScript', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }

            ensureScriptName(_param).then((scriptname) => {
                return ensurePath(_param, true).then((_path) => {
                    let params = [scriptname, _path[0]];
                    return nodeDoc.sdsSession(loginData, params, nodeDoc.downloadScript).then((value) => {
                        vscode.window.setStatusBarMessage('downloaded: ' + scriptname);
                    });
                });
            }).catch((reason) => {
                vscode.window.showErrorMessage('download script failed: ' + reason);
            });
        })
    );


    // ----------------------------------------------------------
    //             Run Script
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.runScript', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }

            ensureScriptName(_param).then((scriptname) => {
                let params = [scriptname];
                return nodeDoc.sdsSession(loginData, params, nodeDoc.runScript).then((value) => {
                    for(let i=0; i<value.length; i++) {
                        console.log("line[" + i + "]: " + value[i]);
                        myOutputChannel.append(value[i] + os.EOL);
                    }
                    myOutputChannel.show();
                });
            }).catch((reason) => {
                vscode.window.showErrorMessage('run script failed: ' + reason);
            });
        })
    );



    // ----------------------------------------------------------
    //             Compare Script
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.compareScript', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }

            // todo should be possible without workspace
            if(vscode.workspace) {
                ensurePath(_param, false, true).then((_path) => {
                    let scriptfolder = _path[0];
                    let _scriptname = _path[1];
                    return ensureScriptName(_scriptname).then((scriptname) => {
                        let comparepath = path.join(vscode.workspace.rootPath, COMPARE_FOLDER);
                        let params = [scriptname, comparepath, COMPARE_FILE_PREF + scriptname];
                        return nodeDoc.sdsSession(loginData, params, nodeDoc.downloadScript).then((value) => {
                            compareScript(scriptfolder, scriptname);
                        });
                    });
                }).catch((reason) => {
                    vscode.window.showErrorMessage('Compare script failed: ' + reason);
                });
            } else {
                vscode.window.showErrorMessage('Please open folder');
            }
        })
    );




    // ----------------------------------------------------------
    //             Upload All
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadAllScripts', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }

            ensurePath(_param).then((folder) => {
                let params = [folder[0]];
                return nodeDoc.sdsSession(loginData, params, nodeDoc.uploadAll).then((value) => {
                    let numscripts = value[0];
                    vscode.window.setStatusBarMessage('uploaded ' + numscripts + ' scripts');
                });
            }).catch((reason) => {
                vscode.window.showErrorMessage('upload all failed: ' + reason);
            });
        })
    );


    // ----------------------------------------------------------
    //             Download All
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadAllScripts', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }

            ensurePath(_param, true).then((_path) => {
                let params = [_path[0]];
                return nodeDoc.sdsSession(loginData, params, nodeDoc.dwonloadAll).then((value) => {
                    let numscripts = value[0];
                    vscode.window.setStatusBarMessage('downloaded ' + numscripts + ' scripts');
                });
            }).catch((reason) => {
                vscode.window.showErrorMessage('download all failed: ' + reason);
            });
        })
    );



    // ----------------------------------------------------------
    //             Save Login Data
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.saveConfiguration', () => {
            if(loginData) {
                createLoginData(loginData).then(() => {
                    vscode.window.setStatusBarMessage('Saved login data');
                }).catch((reason) => {
                    vscode.window.showWarningMessage(reason);
                });
            } else {
                vscode.window.showErrorMessage('unexpected error: login data object missing');
            }
        })
    );


    // ----------------------------------------------------------
    //             Activate
    // ----------------------------------------------------------
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.activate', () => {
            if(loginData) {
                createLoginData(loginData).then(() => {
                    vscode.window.setStatusBarMessage('vscode-documents-scripting is active');
                }).catch((reason) => {
                    vscode.window.showWarningMessage(reason);
                });
            } else {
                vscode.window.showErrorMessage('unexpected error: login data object missing');
            }
        })
    );




    // todo...
    // view documentation
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.viewDocumentation', (file) => {
            // file is not used, use active editor...

            // todo create function viewDocumentation() ...

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

    vscode.window.setStatusBarMessage('vscode-documents-scripting is active');
}



export function deactivate() {
    console.log('The extension is deactivated');
}



function compareScript(_path, scriptname) {
    if(!_path || !scriptname) {
        vscode.window.showErrorMessage('Select or open a file to compare');
        return;
    } else {
        let leftfile = path.join(vscode.workspace.rootPath, COMPARE_FOLDER, COMPARE_FILE_PREF + scriptname + '.js');
        let rightfile = path.join(_path, scriptname + '.js');
        let lefturi = vscode.Uri.file(leftfile);
        let righturi = vscode.Uri.file(rightfile);
        let title = scriptname + '.js' + ' (DOCUMENTS Server)';
        
        vscode.commands.executeCommand('vscode.diff', lefturi, righturi, title).then(() => {
        }, (reason) => {
            vscode.window.showErrorMessage('Compare script failed ' + reason);
        });
    }
}







function getFolder(fileOrFolder: string, allowSubFolder = false): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        fs.stat(fileOrFolder, function (err, stats) {
            
            if(err) {
                if(allowSubFolder && 'ENOENT' === err.code && !path.extname(fileOrFolder)) {
                    let p = fileOrFolder.split(path.sep);
                    let newfolder = p.pop();
                    let _path = p.join(path.sep);
                    fs.stat(_path, function (err, stats) {
                        if(err) {
                            if('ENOENT' === err.code) {
                                reject('can only create a single subfolder on a valid path');
                            } else {
                                reject(err.message);
                            }
                        } else {
                            if(stats.isDirectory()) {
                                resolve([path.join(_path, newfolder)]);
                            } else {
                                reject('can only create a single subfolder on a valid path');
                            }
                        }
                    });
                } else {
                    reject(err.message);
                }
            } else {
                if(stats.isDirectory()) {
                    resolve([fileOrFolder]);
                } else if(stats.isFile()) {
                    resolve([path.dirname(fileOrFolder), path.basename(fileOrFolder, '.js')]);
                } else {
                    reject('unexpected error in ' + fileOrFolder);
                }
            }
        });
    });
}


async function ensurePath(fileOrFolder: string, allowSubDir = false, withBaseName = false): Promise<string[]> {
    console.log('ensurePath');

    return new Promise<string[]>((resolve, reject) => {

        // given path must be absolute
        if(fileOrFolder) {

            // if there's a workspace, returned path must be a subfolder of rootPath
            if(!vscode.workspace || fileOrFolder.startsWith(vscode.workspace.rootPath)) {

                // check folder and get folder from file
                getFolder(fileOrFolder).then((retpath) => {
                    resolve(retpath);
                }).catch((reason) => {
                    reject(reason);
                });
            
            } else {
                reject(fileOrFolder + ' is not a subfolder of ' + vscode.workspace.rootPath);
            }
        } else {

            // set default path
            let defaultPath = '';
            if (vscode.window.activeTextEditor) {
                if(withBaseName) {
                    defaultPath = vscode.window.activeTextEditor.document.fileName;
                } else {
                    defaultPath = path.dirname(vscode.window.activeTextEditor.document.fileName);
                }
            } else if(vscode.workspace && !withBaseName) {
                defaultPath = vscode.workspace.rootPath;
            }
            // ask for path
            let _promt = withBaseName? 'Please enter the script':'Please enter the folder';
            vscode.window.showInputBox({
                prompt: _promt,
                value: defaultPath,
                ignoreFocusOut: true,
            }).then((input) => {

                // input path must be absolute
                if(input) {
                        
                    // if there's a workspace, returned path must be subfolder of rootPath
                    if(!vscode.workspace || input.toLowerCase().startsWith(vscode.workspace.rootPath)) {

                        // check folder and get folder from file
                        getFolder(input, allowSubDir).then((retpath) => {
                            resolve(retpath);
                        }).catch((reason) => {
                            reject(reason);
                        });
                    } else {
                        reject(input + ' is not a subfolder of ' + vscode.workspace.rootPath);
                    }
                } else {
                    reject('no path');
                }
            });
        }
    });
}



async function ensureScriptName(paramscript?: string): Promise<string> {
    console.log('ensureScriptName');
    return new Promise<string>((resolve, reject) => {
        
        if(paramscript) {
            resolve(path.basename(paramscript, '.js'));

        } else {
            let activeScript = '';
            let editor = vscode.window.activeTextEditor;
            if(editor) {
                activeScript = path.basename(editor.document.fileName, '.js');
            }
            vscode.window.showInputBox({
                prompt: 'Please enter the script name or path',
                value: activeScript,
                ignoreFocusOut: true,
            }).then((_scriptname) => {
                if(_scriptname) {
                    resolve(path.basename(_scriptname, '.js'));
                } else {
                    reject('no script');
                }
            });
        }
    });
}




async function ensureScript(param?: string | vscode.TextDocument): Promise<nodeDoc.script> {
    console.log('ensureScript');
    return new Promise<nodeDoc.script>((resolve, reject) => {

        if(param) {
            if(typeof param === 'string') {
                let ret = nodeDoc.getScript(param);
                if(typeof ret !== 'string') {
                    resolve(ret);
                } else {
                    reject(ret);
                }

            } else { // vscode.TextDocument
                let ret: nodeDoc.script = {
                    name: path.basename(param.fileName, '.js'),
                    sourceCode: param.getText()
                };
                resolve(ret);
            }
        } else {
            let activeScript = '';
            let editor = vscode.window.activeTextEditor;
            if(editor) {
                activeScript = editor.document.fileName;
            }
            vscode.window.showInputBox({
                prompt: 'Please enter the script name or path',
                value: activeScript,
                ignoreFocusOut: true,
            }).then((_scriptname) => {
                if(_scriptname) {
                    let ret = nodeDoc.getScript(_scriptname);
                    if(typeof ret !== 'string') {
                        resolve(ret);
                    } else {
                        reject(ret);
                    }
                } else {
                    reject('no scriptname');
                }
            });

        }
    });
}





// additional function to get login data...


async function createLoginData(_loginData:nodeDoc.LoginData): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        askForLoginData(_loginData).then(() => {
            return writeLaunchJson(_loginData).then(() => {
                resolve();
            });
        }).catch((reason) => {
            reject('did not save login data: ' + reason);
        });
    });
}

async function askForLoginData(_loginData:nodeDoc.LoginData): Promise<void> {
    console.log('askForLoginData');
    
    const SERVER: string = 'localhost';
    const PORT: number = 11000;
    const PRINCIPAL: string = 'dopaag';
    const USERNAME: string = 'admin';
    const PASSWORD = '';

    return new Promise<void>((resolve, reject) => {
        // showQuickPick() and showInputBox() return thenable(value) objects,
        // that is, these objects always have a then(value) function,
        // value can't be empty iff it's predefined in options
        vscode.window.showInputBox({
            prompt: 'Please enter the server',
            value: SERVER,
            ignoreFocusOut: true,
        }).then((server) => {
            if(server) {
                _loginData.server = server;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the port',
                    value: _loginData.port? _loginData.port.toString(): PORT.toString(),
                    ignoreFocusOut: true,
                });
            }
        }).then((port) => {
            if(port) {
                _loginData.port = Number(port);
                return vscode.window.showInputBox({
                    prompt: 'Please enter the principal',
                    value: _loginData.principal? _loginData.principal: PRINCIPAL,
                    ignoreFocusOut: true,
                });
            }
        }).then((principal) => {
            if(principal) {
                _loginData.principal = principal;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the username',
                    value: _loginData.username? _loginData.username: USERNAME,
                    ignoreFocusOut: true,
                });
            }
        }).then((username) => {
            if(username) {
                _loginData.username = username;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the password',
                    value: PASSWORD,
                    password: true,
                    ignoreFocusOut: true,
                });
            }
        }).then((password) => {
            if(password != undefined) {
                _loginData.password = password;
                resolve();
            } else {
                reject();
                vscode.window.showErrorMessage('Input login data cancelled: command cannot be executed');
            }
        });
    });
}



async function writeLaunchJson(_loginData:nodeDoc.LoginData): Promise<void> {
    console.log('writeLaunchJson');

    return new Promise<void>((resolve, reject) => {
        initialConfigurations.forEach((config: any) => {
            if (config.request == 'launch') {
                config.host = _loginData.server;
                config.applicationPort = _loginData.port;
                config.principal = _loginData.principal;
                config.username = _loginData.username;
                config.password = _loginData.password;
            }
        });

        const configurations = JSON.stringify(initialConfigurations, null, '\t')
            .split('\n').map(line => '\t' + line).join('\n').trim();

        const data = [
            '{',
            '\t// Use IntelliSense to learn about possible configuration attributes.',
            '\t// Hover to view descriptions of existing attributes.',
            '\t// For more information, visit',
            '\t// https://github.com/otris/vscode-janus-debug/wiki/Launching-the-Debugger',
            '\t"version": "0.2.0",',
            '\t"configurations": ' + configurations,
            '}',
        ].join('\n');


        let rootPath = vscode.workspace.rootPath;
        if(rootPath) {
            let filename = path.join(rootPath, '.vscode', 'launch.json');
            nodeDoc.writeFile(data, filename, true).then(() => {
                resolve();
            }).catch((reason) => {
                reject(reason);
            });
        } else {
            reject('folder must be open to save login data');
        }
    });
}













// todo...


// rename to getJSFromTS
// async function uploadJSFromTS(sdsConnection: SDSConnection, textDocument: vscode.TextDocument): Promise<void> {
//     return new Promise<void>((resolve, reject) => {

//         if(!textDocument || '.ts' !== path.extname(textDocument.fileName)) {
//             reject('No active ts script');

//         } else {
//             let shortName = '';
//             let scriptSource = '';

//             shortName = path.basename(textDocument.fileName, '.ts');
//             let tsname:string = textDocument.fileName;
//             let jsname:string = tsname.substr(0, tsname.length - 3) + ".js";
//             //let tscargs = ['--module', 'commonjs', '-t', 'ES6'];
//             let tscargs = ['-t', 'ES5', '--out', jsname];
//             let retval = tsc.compile([textDocument.fileName], tscargs, null, function(e) { console.log(e); });
//             scriptSource = retval.sources[jsname];
//             console.log("scriptSource: " + scriptSource);
        
//             sdsAccess.uploadScript(sdsConnection, shortName, scriptSource).then((value) => {
//                 vscode.window.setStatusBarMessage('uploaded: ' + shortName);
//                 resolve();
//             }).catch((reason) => {
//                 reject(reason);
//             });
//         }
//     });
// }
