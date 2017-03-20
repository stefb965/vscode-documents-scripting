
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Hash, crypt_md5 } from 'node-sds';


const INI_DEFAULT_NAME: string = 'default.ini';
const INI_CONN_PART: string = '[Connection]';
const CRYPTMD5_SALT: string = 'o3';


const QP_SAVE_CONF: string = 'Save Login Data';
const QP_MAYBE_LATER: string = 'Maybe later';








export const SERVER: string = 'localhost';
export const PORT: number = 11000;
export const PRINCIPAL: string = 'dopaag';
export const USER: string = 'admin';
export const PASSWORD = '';

export class IniData {
    // todo private + getter...

    // login data
    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public user: string = '';
    public hash: Hash = undefined;

    public oc: vscode.OutputChannel;


    constructor (oc: vscode.OutputChannel) {
        this.oc = oc;
    }

    // public clearAllData(output = false) {
    //     this.server = '';
    //     this.port = 0;
    //     this.principal = '';
    //     this.user = '';
    //     this.hash = undefined;
    //     if(output) {
    //         vscode.window.setStatusBarMessage('Reset configuration');
    //     }
    // }

    public checkLoginData(): boolean {
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.user) {
            return false;
        }
        return true;
    }

    async ensureLoginData(): Promise<void> {
        console.log('IniData.ensureLoginData');
        return new Promise<void>((resolve, reject) => {

            if(this.checkLoginData()) {
                resolve();

            } else if(this.loadIniFile() && this.checkLoginData()) {
                resolve();

            } else { // loginData not set and no usable configuration file found

                // askForLoginData() is called inside inputProcedure(),
                // inputProcedure() additional asks for the downloadpath
                // and for saving the input
                this.inputProcedure().then(() => {
                    resolve();
                }).catch((reason) => {
                    reject(reason);
                });
            }
        });
    }


    async inputProcedure(): Promise<void> {
        return new Promise<void>((resolve, reject) => {

            // input login data
            this.askForLoginData().then(() => {
                this.writeIniFile().then(() => {
                    vscode.window.setStatusBarMessage('Saved login data');
                    resolve();
                }).catch((reason) => {
                    this.oc.append('Error: cannot save configuration: ' + reason);
                    this.oc.show();
                    resolve();
                });
                resolve();
            }).catch((reason) => {
                console.log('reject from askForLoginData(): ' + reason);
                reject(reason);
            });
        });
    }


    async askForLoginData(): Promise<void> {
        console.log('IniData.askForLoginData');

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
                    this.server = server;
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the port',
                        value: this.port? this.port.toString(): PORT.toString(),
                        ignoreFocusOut: true,
                    });
                }
            }).then((port) => {
                if(port) {
                    this.port = Number(port);
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the principal',
                        value: this.principal? this.principal: PRINCIPAL,
                        ignoreFocusOut: true,
                    });
                }
            }).then((principal) => {
                if(principal) {
                    this.principal = principal;
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the user',
                        value: this.user? this.user: USER,
                        ignoreFocusOut: true,
                    });
                }
            }).then((user) => {
                if(user) {
                    this.user = user;
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the password',
                        value: this.hash? this.hash.value: PASSWORD,
                        password: true,
                        ignoreFocusOut: true,
                    });
                }
            }).then((password) => {
                if(undefined != password) {
                    // empty passwords are not hashed in janus
                    let pwnotempty: boolean = (password.length > 0);
                    // only create new hash, if the user typed in a password
                    let newhash: boolean = (!this.hash || (password !== this.hash.value));
                    if(pwnotempty && newhash) {
                        this.hash = crypt_md5(password, CRYPTMD5_SALT);
                    }
                    resolve();
                } else {
                    reject();
                    vscode.window.showErrorMessage('Input login data cancelled: command cannot be executed');
                }
            });
        });
    }






    // // todo load current file
    // async loadConfiguration(): Promise<void> {
    //     return new Promise<void>((resolve, reject) => {
    //         vscode.window.showInputBox({
    //             prompt: 'Please enter the file',
    //             ignoreFocusOut: true,
    //         }).then((file) => {
    //             if(file) {
    //                 let _file = file.replace(/"/g, '');
    //                 this.loadIniFile(_file);
    //                 vscode.window.setStatusBarMessage('Configuration loaded');
    //                 resolve();
    //             }
    //         });
    //     });
    // }


    public loadIniFile(): boolean {
        console.log('IniData.loadIniFile');

        let file = this.findIniFile();
        if(!file) {
            return false;
        }

        let contentBuf = fs.readFileSync(file, 'utf8');
        let contentStr = contentBuf.toString();
        let lines = contentStr.split(os.EOL);
        let pw_changed = false;
        if(INI_CONN_PART === lines[0]) {
            for(let i=1; i<lines.length; i++) {
                // hash values doesn't contain '=',
                // so it should be ok to split using the seperator '='
                let line = lines[i].split('=');
                if(line && line.length > 0) {
                    switch(line[0]) {
                        case 'server':
                            this.server = line[1];
                            break;
                        case 'port':
                            this.port = Number(line[1]);
                            break;
                        case 'principal':
                            this.principal = line[1];
                            break;
                        case 'user':
                            this.user = line[1];
                            break;
                        case 'password':
                            // empty passwords are not hashed in janus
                            if(line[1].length > 0) {
                                this.hash = crypt_md5(line[1], CRYPTMD5_SALT);
                                pw_changed = true;
                            }
                            break;
                        case 'hash':
                            if(!pw_changed) {
                                this.hash = new Hash(line[1]);
                            }
                            break;
                        // case 'localpath':
                        //     if(INI_PATH === line[1]) {
                        //         this.localpath = dirname(this.iniFile);
                        //     } else {
                        //         this.localpath = line[1];
                        //     }
                        //     break;
                        case '':
                            console.log('empty line');
                            break;
                        default:
                            console.log('unknown entry ' + line[0]);
                    }
                }
            }
        }
        return true;
    }



    async writeIniFile(): Promise<void> {
        console.log('IniData.writeIniFile');
        let data = '';
        data += INI_CONN_PART + os.EOL;
        data += 'server=' + this.server + os.EOL;
        data += 'port=' + this.port + os.EOL;
        data += 'principal=' + this.principal + os.EOL;
        data += 'user=' + this.user + os.EOL;
        data += 'password=' + os.EOL;
        if(this.hash) {
            data += 'hash=' + this.hash.value + os.EOL;
        }
        return this.writeDefaultIni(data);
    }


    public findIniFile(): string {
        console.log('IniData.findIniFile');
        let rootPath = vscode.workspace.rootPath;
        if(!rootPath) {
            return '';
        }

        let ini = path.join(rootPath, '.vscode', INI_DEFAULT_NAME);
        try {
            fs.accessSync(ini);
            return ini;
        } catch (e) {
            return '';
        }
    }



    async writeDefaultIni (data) {

        return new Promise<void>((resolve, reject) => {
            let rootPath = vscode.workspace.rootPath;
            
            if(!rootPath) {
                vscode.window.showWarningMessage("Login Data can only be saved if a folder is open");
                resolve();

            } else {
                let _path: string = path.join(rootPath, '.vscode');
                let file = path.join(_path, INI_DEFAULT_NAME);

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

    dispose() {
        //
    }
}
