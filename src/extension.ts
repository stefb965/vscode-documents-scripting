'use strict';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import * as reduce from 'reduce-for-promises';
import * as tsc from 'typescript-compiler';

import * as config from './config';
import { SDSConnection } from 'node-sds';
import * as sdsAccess from './sdsAccess';

const open = require('open');
const urlExists = require('url-exists');


const LAUNCH_JSON_NAME: string = 'launch.json';

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



// todo
let myOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('MyChannelName');


// hack
const DIFF_FOLDER = '_tmp';





export function activate(context: vscode.ExtensionContext) {


    // set up...

    // object loginData should be deleted on deactivation
    let launchjson = path.join(vscode.workspace.rootPath, '.vscode', LAUNCH_JSON_NAME);
    let loginData: config.LoginData = new config.LoginData(launchjson);
    context.subscriptions.push(loginData);

    
    if(!loginData.ensureLoginData())
    {
        inputProcedure(loginData);
    }


    sdsAccess.setServerOperation((sdsConnection: SDSConnection, param: any[]) => documentsOperation(sdsConnection, param));



    // register commands...


    // download all
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadAllScripts', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }
            sdsAccess.sdsSession(loginData, ['downloadAllScripts', _param]).then(() => {

            }).catch((reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );

    // download script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.downloadScript', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }
            sdsAccess.sdsSession(loginData, ['downloadScript', _param]).then(() => {

            }).catch((reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );

    // upload all
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadAllScripts', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }
            sdsAccess.sdsSession(loginData, ['uploadAllScripts', _param]).then(() => {

            }).catch((reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );

    // upload script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.uploadScript', (param) => {
            let _param;
            if (param) {
                _param = param._fsPath;
            }
            sdsAccess.sdsSession(loginData, ['uploadScript', _param]).then(() => {

            }).catch((reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );


    // run script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.runScript', (param) => {
            let _param;
            if(param) {
                _param = param._fsPath;
            }
            sdsAccess.sdsSession(loginData, ["runScript", _param]).then(() => {

            }).catch((reason) => {
                vscode.window.showErrorMessage(reason);
            });
        })
    );




    // upload script on save
    let disposableOnSave: vscode.Disposable;
    disposableOnSave = vscode.workspace.onDidSaveTextDocument((textDocument) => {

        const UPLOAD:  string = 'Upload script to Server?';
        const CANCEL:  string = 'Not now';
        const NEVER:   string = 'Never in this session';

        // javascript files
        if('.js' === path.extname(textDocument.fileName)) {
            vscode.window.showQuickPick([UPLOAD, CANCEL, NEVER]).then((value) => {
                if(UPLOAD === value) {
                    sdsAccess.sdsSession(loginData, ['uploadScript', textDocument]);
                } else if(NEVER === value) {
                    disposableOnSave.dispose();
                }
            });
        } else {
            vscode.window.showInformationMessage('Only upload JavaScript files for now');
        }

        // typescript files
        // const COMPILE: string = 'Compile and upload javascript to Server?';
        // else if(textDocument.fileName.endsWith(".ts")) {
        //     vscode.window.showQuickPick([COMPILE, CANCEL, NEVER]).then((value) => {
        //         if(COMPILE === value) {
        //             connectAndCallOperation('uploadScript', textDocument);
        //         } else if(NEVER === value) {
        //             disposableOnSave.dispose();
        //         }
        //     });
        // }

    }, this);
    context.subscriptions.push(disposableOnSave);


    // save configuration
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.saveConfiguration', () => {
            if(loginData) {
                inputProcedure(loginData);
            }
        })
    );

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
    
    // compare script
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.compareScript', (param) => {
            compareScript(param);
        })
    );


    vscode.window.setStatusBarMessage('vscode-documents-scripting is active');

}



export function deactivate() {
    console.log('The extension is deactivated');
    // context.subscriptions...?
}




function compareScript(param) {
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
            if(vscode.workspace.rootPath) {

                // download leftfile -> as unsaved?
                let leftfile = path.join(vscode.workspace.rootPath, DIFF_FOLDER, filename);

                let rightfile = filepath;
                let lefturi = vscode.Uri.file(leftfile);
                let righturi = vscode.Uri.file(rightfile);
                let title = 'Compare ' + filename;
                
                vscode.commands.executeCommand('vscode.diff', lefturi, righturi, title).then(() => {
                }, (reason) => {
                    vscode.window.showInformationMessage('View Diff is not yet available!');
                });

                // delete rightfile on close
            }
        }
    }
}





async function inputProcedure(_loginData:config.LoginData): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        askForLoginData(_loginData).then(() => {
            return writeLaunchJson(_loginData).then(() => {
                vscode.window.setStatusBarMessage('Saved login data');
                resolve();
            });
        }).catch((reason) => {
            vscode.window.showErrorMessage('did not save login data: ' + reason);
            reject(reason);
        });
    });
}

async function askForLoginData(_loginData:config.LoginData): Promise<void> {
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



async function writeLaunchJson(_loginData:config.LoginData): Promise<void> {
    console.log('writeLaunchJson');

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

    return writeFileToWorkspace(data);
}


async function writeFileToWorkspace (data) {
    console.log('writeConfigFile');

    return new Promise<void>((resolve, reject) => {
        let rootPath = vscode.workspace.rootPath;
        
        if(!rootPath) {
            vscode.window.showWarningMessage("login data can only be saved in workspace");
            resolve();

        } else {
            let _path: string = path.join(rootPath, '.vscode');
            let file = path.join(_path, LAUNCH_JSON_NAME);

            fs.writeFile(file, data, {encoding: 'utf8'}, function(error) {
                if(error) {
                    if(error.code === 'ENOENT') {
                        fs.mkdir(_path, function(error) {
                            if(error) {
                                reject(error);
                            } else {
                                console.log('created path: ' + _path);
                                fs.writeFile(file, data, {encoding: 'utf8'}, function(error) {
                                    if(error) {
                                        reject(error);
                                    } else {
                                        console.log('wrote file: ' +  file);
                                        resolve();
                                    }
                                });
                            }
                        });
                    } else {
                        reject(error);
                    }
                } else {
                    console.log('wrote file: ' +  file);
                    resolve();
                }
            });

        }
    });
}







function getActivePath(): string {
    console.log('getActivePath');

    // file open?
    let editor = vscode.window.activeTextEditor;
    if (editor) {
        return path.dirname(editor.document.fileName);

    // root path?
    } else if(vscode.workspace) {
        return vscode.workspace.rootPath;
    }

    return '';
}




function getPathFromFileOrDir(parampath: string, allowSubDir = false): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        fs.stat(parampath, function (err, stats) {
            
            if(err) {
                if(allowSubDir && 'ENOENT' === err.code) {
                    let p = parampath.split(path.sep);
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
                                resolve(path.join(_path, newfolder));
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
                    resolve(parampath);
                } else if(stats.isFile()) {
                    resolve(path.dirname(parampath));
                } else {
                    reject('unexpected error in ' + parampath);
                }
            }
        });
    });
}


async function ensurePath(parampath: string, allowSubDir = false): Promise<string> {
    console.log('ensureDownloadPath');

    return new Promise<string>((resolve, reject) => {

        // given path must be absolute
        if(parampath) {

            // if there's a workspace, returned path must be a subfolder of rootPath
            if(!vscode.workspace || parampath.startsWith(vscode.workspace.rootPath)) {

                // return path of given file or folder
                getPathFromFileOrDir(parampath).then((retpath) => {
                    resolve(retpath);
                }).catch((reason) => {
                    reject(reason);
                });
            
            } else {
                reject(parampath + ' is not a subfolder of ' + vscode.workspace.rootPath);
            }
        } else {

            // ask for path
            let defaultPath = getActivePath();
            vscode.window.showInputBox({
                prompt: 'Please enter the download path',
                value: defaultPath,
                ignoreFocusOut: true,
            }).then((inputpath) => {

                // input path must be absolute
                if(inputpath) {
                        
                    // if there's a workspace, returned path must be subfolder of rootPath
                    if(!vscode.workspace || inputpath.startsWith(vscode.workspace.rootPath)) {

                        // return path of input file or folder
                        getPathFromFileOrDir(inputpath, allowSubDir).then((retpath) => {
                            resolve(retpath);
                        }).catch((reason) => {
                            reject(reason);
                        });
                    } else {
                        reject(inputpath + ' is not a subfolder of ' + vscode.workspace.rootPath);
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




async function ensureScript(param?: string | vscode.TextDocument): Promise<sdsAccess.script> {
    console.log('ensureScript');
    return new Promise<sdsAccess.script>((resolve, reject) => {

        if(param) {
            if(typeof param === 'string') {
                let ret = sdsAccess.getScript(param);
                if(typeof ret !== 'string') {
                    resolve(ret);
                } else {
                    reject(ret);
                }

            } else { // vscode.TextDocument
                let ret: sdsAccess.script = {
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
                    let ret = sdsAccess.getScript(_scriptname);
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


async function documentsOperation(sdsConnection: SDSConnection, param: any[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        switchOperation(sdsConnection, param).then(() => {
            resolve();
        }).catch((reason) => {
            reject(reason);
        });
    });
}


async function switchOperation(sdsConnection: SDSConnection,
                               param: any[]): Promise<void> {
    
    return new Promise<void>((resolve, reject) => {

        let operation = param[0];
        if(typeof operation !== 'string') {
            reject('first parameter must be operation as string');
        }


        if('uploadScript' === operation) {
            ensureScript(param[1]).then((_script) => {
                return sdsAccess.uploadScript(sdsConnection, _script.name, _script.sourceCode).then(() => {
                    vscode.window.setStatusBarMessage('uploaded: ' + _script.name);
                    resolve();
                });
            }).catch((reason) => {
                reject('upload script failed: ' + reason);
            });
        }


        else if('downloadScript' === operation) {
            ensureScriptName(param[1]).then((scriptname) => {
                return ensurePath(param[1], true).then((_path) => {
                    return sdsAccess.downloadScript(sdsConnection, scriptname, _path).then(() => {
                        vscode.window.setStatusBarMessage('downloaded: ' + scriptname);
                        resolve();
                    });
                });
            }).catch((reason) => {
                reject('download script failed: ' + reason);
            });
        }



        else if('runScript' === operation) {
            ensureScriptName(param[1]).then((scriptname) => {
                return sdsAccess.runScript(sdsConnection, scriptname).then((value) => {
                    vscode.window.setStatusBarMessage('runScript: ' + scriptname);
                    for(let i=0; i<value.length; i++) {
                        console.log("line[" + i + "]: " + value[i]);
                        myOutputChannel.append(value[i] + os.EOL);
                    }
                    myOutputChannel.show();
                    resolve();
                });
            }).catch((reason) => {
                reject('run script failed: ' + reason);
            });
        }



        else if('uploadAllScripts' === operation) {
            ensurePath(param[1]).then((folder) => {
                return sdsAccess.uploadAll(sdsConnection, folder).then((numscripts) => {
                    vscode.window.setStatusBarMessage('uploaded ' + numscripts + ' scripts');
                    resolve();
                });
            }).catch((reason) => {
                reject('upload all failed: ' + reason);
            });
        }


        else if('downloadAllScripts' === operation) {
            ensurePath(param[1], true).then((_path) => {
                return sdsAccess.getScriptNamesFromServer(sdsConnection).then((scriptNames) => {
                    return reduce(scriptNames, function(numscripts, name) {
                        return sdsAccess.downloadScript(sdsConnection, name, _path).then(() => {
                            return numscripts + 1;
                        });
                    }, 0).then((numscripts) => {
                        vscode.window.setStatusBarMessage('downloaded ' + numscripts + ' scripts');
                        resolve();
                    });
                });
            }).catch((reason) => {
                reject('download all failed: ' + reason);
            });
        }


        // else if...

        else {
            reject('switchOperation: unknown operation: ' + operation);
        }

    });
}









// todo getJSFromTS
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
