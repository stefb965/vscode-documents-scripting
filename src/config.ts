
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse, dirname, extname } from 'path';
import { Hash, crypt_md5 } from 'node-sds';


const INI_DEFAULT_NAME: string = 'default.ini';
const INI_CONN_PART: string = '[Connection]';
const INIPATH: string = '[INIPATH]';
const CRYPTMD5_SALT: string = 'o3';


const QUICKPICK_CREATE_INI: string = 'Create default.ini';
const QUICKPICK_MAYBE_LATER: string = 'Maybe later';
const INPUT_CANCELLED: string = 'input procedure cancelled';



async function writeFileMkdir (_path, data) {
    let file: string = '';
    let path: string = '';

    // does _path contain the file?
    if('' === extname(_path)) {
        // no extension: _path is only the path
        file = _path;
        if(!file.endsWith('\\')) {
            file += '\\';
        }
        file += INI_DEFAULT_NAME;
        path = _path;
    } else {
        // extension in _path: _path is the whole filename
        file = _path;
        path = dirname(file);
    }

    return new Promise<void>((resolve, reject) => {
        fs.writeFile(file, data, {encoding: 'utf8'}, function(error) {
            if(error) {
                if(error.code === 'ENOENT') {
                    fs.mkdir(path, function(error) {
                        if(error) {
                            reject(error);
                        } else {
                            console.log('created path: ' + path);
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
    });
}





export const SERVER: string = 'localhost';
export const PORT: number = 11000;
export const PRINCIPAL: string = '';
export const USER: string = 'admin';
export const PASSWORD: string = '';

export class IniData {
    // todo private + getter...

    // login data
    // Don't rename!
    public server: string;
    public port: number;
    public principal: string;
    public user: string;
    public hash: Hash = undefined;

    // path for up- and download all
    public localpath: string = '';

    public iniFile:string   = '';

    // const
    // windows eol
    private eol: string = '\r\n';

    constructor () {
        this.clearAllData();
    }

    public clearAllData() {
        this.server = '';
        this.port = 0;
        this.principal = '';
        this.user = '';
        this.hash = undefined;
        this.localpath = '';
    }

    public checkLoginData(): boolean {
        if('' === this.server || 0  === this.port || '' === this.principal || '' === this.user) {
            return false;
        }
        return true;
    }

    public checkDownloadPath(): boolean {
        if('' === this.localpath) {
            return false;
        }
        return true;
    }

    async ensureLoginData(): Promise<void> {
        console.log('IniData.ensureLoginData');
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
                }).catch((reason) => {
                    //console.log('ensureLoginData() failed: ' + reason);
                    reject(reason);
                });
            }
        });
    }

    async ensureDownloadPath(): Promise<void> {
        console.log('IniData.ensureDownloadPath');
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
                }).catch((reason) => {
                    //console.log('ensureDownloadPath() failed: ' + reason);
                    reject(reason);
                });
            }
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
                        value: PORT.toString(),
                        ignoreFocusOut: true,
                    });
                }
            }).then((port) => {
                if(port) {
                    this.port = Number(port);
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the principal',
                        value: PRINCIPAL,
                        ignoreFocusOut: true,
                    });
                }
            }).then((principal) => {
                if(principal) {
                    this.principal = principal;
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the user',
                        value: 'admin',
                        ignoreFocusOut: true,
                    });
                }
            }).then((user) => {
                if(user) {
                    this.user = user;
                    return vscode.window.showInputBox({
                        prompt: 'Please enter the password',
                        value: PASSWORD,
                        password: true,
                        ignoreFocusOut: true,
                    });
                }
            }).then((password) => {
                if(undefined != password) {
                    if(password.length > 0) {
                        this.hash = crypt_md5(password, CRYPTMD5_SALT);
                    }
                    return vscode.window.showQuickPick([
                        QUICKPICK_CREATE_INI,
                        QUICKPICK_MAYBE_LATER
                    ]);
                }
            }).then((decision) => {
                if(decision) {
                    if(QUICKPICK_CREATE_INI === decision) {
                        this.askForDownloadPath().then(() => {
                            return this.writeIniFile(this.localpath + '\\' + INI_DEFAULT_NAME);
                        }).then(() => {
                            console.log('writeIniFile successful');
                            resolve();
                        }).catch((reason) => {
                            //console.log('askForLoginData(): askForDownloadPath or writeIniFile failed: ' + reason);
                            reject(reason);
                        });
                    } else {
                        resolve();
                    }
                } else {
                    //console.log('askForLoginData() failed: ' + reason);
                    reject(INPUT_CANCELLED);
                }
            });
        });
    }

    async askForDownloadPath(): Promise<void> {
        console.log('IniData.askForDownloadPath');
        let activePath = this.getActivePath();
        return new Promise<void>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: 'Please enter the download path',
                value: activePath,
                ignoreFocusOut: true,
            }).then((localpath) => {
                if(localpath) {
                    this.localpath = localpath;
                    resolve();
                } else {
                    //console.log('askForDownloadPath() failed: ' + reason);
                    reject(INPUT_CANCELLED);
                }
            });
        });
    }




    public loadIniFile(): boolean {
        console.log('IniData.loadIniFile');
        let activePath = this.getActivePath();
        let file = this.findIni(activePath);
        if(!file) {
            return false;
        }
        this.iniFile = file;

        let contentBuf = fs.readFileSync(file, 'utf8');
        let contentStr = contentBuf.toString();
        let lines = contentStr.split(this.eol);
        let pw_changed = false;
        if(INI_CONN_PART === lines[0]) {
            for(let i=1; i<lines.length; i++) {
                let line = lines[i].split('=');
                if(this[line[0]] !== undefined) {
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
                        case 'localpath':
                            if(INIPATH === line[1]) {
                                this.localpath = dirname(this.iniFile);
                            } else {
                                this.localpath = line[1];
                            }
                            break;
                        default:
                            console.log('unknown entry ' + line[1]);
                    }
                    console.log(line[0] + ': ' + line[1]);
                }
            }
        }
        return true;
    }

    async writeIniFile(path: string): Promise<void> {
        console.log('IniData.writeIniFile');
        let data = '';
        data += INI_CONN_PART + this.eol;
        data += 'server=' + this.server + this.eol;
        data += 'port=' + this.port + this.eol;
        data += 'principal=' + this.principal + this.eol;
        data += 'user=' + this.user + this.eol;
        if(this.hash) {
            data += 'hash=' + this.hash.value + this.eol;
        } else {
            data += 'password=' + PASSWORD + this.eol;
        }
        data += 'localpath=' + INIPATH + this.eol;
        return writeFileMkdir(path, data);
    }

    public getActivePath(): string {
        console.log('IniData.getActivePath');

        let editor = vscode.window.activeTextEditor;
        if (editor && editor.document) {
            let file = editor.document.fileName;
            const parsedPath = parse(file);
            return parsedPath.dir;
        }

        return vscode.workspace.rootPath;
    }

    public findIni(path: string): string {
        console.log('IniData.findIni');
        if(!path) {
            return null;
        }

        const ini = path + '\\' + INI_DEFAULT_NAME;
        try {
            fs.accessSync(ini);
            return ini;
        } catch (e) {
            return null;
        }
    }
}
