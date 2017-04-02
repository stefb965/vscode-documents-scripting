import * as fs from 'fs';
import * as path from 'path';
import { connect, Socket } from 'net';
import * as reduce from 'reduce-for-promises';

import { SDSConnection, Hash, crypt_md5, getJanusPassword } from 'node-sds';
import * as config from './config';


export type script = {name: string, sourceCode: string};

const SDS_TIMEOUT: number = 60 * 1000;


let documentsOperation = (sdsConnection: SDSConnection, param: any[]) => {
    return new Promise<void>((resolve, reject) => {
        resolve();
    });
};


// todo param of documentsSession()
export function setDocumentsOperation(func) {
    documentsOperation = func;
}


export function documentsSession(loginData: config.LoginData, param: any[]) {

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

            doLogin(loginData, sdsSocket).then((sdsConnection) => {
                // switchOperation() and closeConnection() are both called inside doLogin.then()
                // because both need parameter sdsConnection
                
                // call switchOperation() and then close the connection in any case
                documentsOperation(sdsConnection, param).then(() => {
                    doLogout(sdsConnection).catch((reason) => {
                        console.log(reason);
                    });
                }).catch((reason) => {
                    console.log(reason);
                    doLogout(sdsConnection); // => check socket-on-close
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

            // todo move this somewhere else...
            //vscode.window.showErrorMessage('failed to connect to host: ' + loginData.server + ' and port: ' + loginData.port);
        });

    }).catch((reason) => {
        console.log('ensureLoginData failed: ' + reason);
    });
}


export async function doLogin(loginData: config.LoginData, sdsSocket: Socket): Promise<SDSConnection> {
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
            doLogout(sdsConnection).catch((reason) => {
                console.log(reason);
            });
        });
    });
}


export async function doLogout(sdsConnection: SDSConnection): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        sdsConnection.disconnect().then(() => {
            resolve();
        }).catch((reason) => {
            reject("doLogout: " + reason);
        });
    });
}






export async function getScriptNamesFromServer(sdsConnection: SDSConnection): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.getScriptNames", []).then((scriptNames) => {
            resolve(scriptNames);
        }).catch((reason) => {
            reject("getScriptNames() failed: " + reason);
        });
    });
}

export function getScript(file: string): script {
    let s: script;
    if(file && path.isAbsolute(file) && '.js' === path.extname(file)) {
        try {
            let sc = fs.readFileSync(file, 'utf8');
            let _name = path.basename(file, '.js');
            s = {name: _name, sourceCode: sc};
            //console.log('script added: ' + _name);
        } catch(err) {
            console.log('catch in readFileSync: ' + err);
        }
    }
    return s;
}


export async function getScriptsFromFolder(_path: string): Promise<script[]> {
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
                    let s = getScript(file);
                    if(s) {
                        scripts.push(s);
                    }
                }
            });

            resolve(scripts);
        });
    });
}

export async function uploadAll(sdsConnection: SDSConnection, folder: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
        return getScriptsFromFolder(folder).then((scripts) => {
            return reduce(scripts, function(numscripts, _script) {
                return uploadScript(sdsConnection, _script.name, _script.sourceCode).then(() => {
                    return numscripts + 1;
                });
            }, 0).then((numscripts) => {
                resolve(numscripts);
            });
        });
    });
}


export async function downloadScript(sdsConnection: SDSConnection, scriptName: string, parampath: string): Promise<void> {
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

export async function uploadScript(sdsConnection: SDSConnection, shortName: string, scriptSource: string): Promise<void> {
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
            reject('uploadScript' + '(): sdsConnection.callClassOperation failed: ' + reason);
        });
    });
}

export async function runScript(sdsConnection: SDSConnection, shortName: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
        sdsConnection.callClassOperation("PortalScript.runScript", [shortName]).then((value) => {
            resolve(value);
        }).catch((reason) => {
            reject("runScript(): sdsConnection.callClassOperation failed: " + reason);
        });
    });
}

