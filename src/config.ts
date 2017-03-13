
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Hash, crypt_md5 } from 'node-sds';


const INI_DEFAULT_NAME: string = 'default.ini';
const INI_CONN_PART: string = '[Connection]';
const CRYPTMD5_SALT: string = 'o3';


const QP_SAVE_CONF_AS: string = 'Save configuration as root path';
const QP_MAYBE_LATER: string = 'Maybe later';



// todo new file 'utils.ts'
async function writeFileMkdir (parampath, data) {
    let _path: string = parampath;
    if(path.extname(parampath)) {
        _path = path.dirname(parampath);
    }
    let file: string = path.join(_path, INI_DEFAULT_NAME);

    return new Promise<void>((resolve, reject) => {
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
    });
}





export const SERVER: string = 'localhost';
export const PORT: number = 11000;
export const PRINCIPAL: string = '';
export const USER: string = 'admin';
export const PASSWORD = '';

export class IniData {
    // todo private + getter...

    // login data
    public server: string;
    public port: number;
    public principal: string;
    public user: string;
    public hash: Hash = undefined;

    public oc: vscode.OutputChannel;


    constructor (oc: vscode.OutputChannel) {
        this.oc = oc;
        this.clearAllData();
    }

    public clearAllData(output = false) {
        this.server = '';
        this.port = 0;
        this.principal = '';
        this.user = '';
        this.hash = undefined;
        if(output) {
            vscode.window.setStatusBarMessage('Reset configuration');
        }
    }

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

                // save?
                return vscode.window.showQuickPick([
                    QP_SAVE_CONF_AS,
                    QP_MAYBE_LATER
                ]);

            }).then((decision) => {
                // only a resolved promise should be returned here
                // because the server call can be executed even if
                // the configuration couldn't be saved
                if(decision) { 
                    
                    // try rootPath, if there's no rootPath, save to activePath
                    // if there's no activePath, user has to insert the path
                    let rootPath = vscode.workspace? vscode.workspace.rootPath:'';
                    let activePath = this.getActivePath();
                    let defaultPath: string = rootPath? rootPath: activePath;
                    let showPath = '';
                    if(defaultPath) {
                        showPath = path.join(defaultPath, INI_DEFAULT_NAME);
                    }
                    if (QP_SAVE_CONF_AS === decision) {
                        vscode.window.showInputBox({
                            prompt: 'Please enter the path',
                            value: showPath,
                            ignoreFocusOut: true,
                        }).then((_path) => {
                            if(_path) {
                                this.writeIniFile(_path).then(() => {
                                    vscode.window.setStatusBarMessage('Configuration saved');
                                    resolve();
                                }).catch((reason) => {
                                    this.oc.append('Error: cannot save configuration: ' + reason);
                                    this.oc.show();
                                    resolve();
                                });
                            } else {
                                console.log('configuration not saved because no path was set');
                                resolve();
                            }
                        });
                    } else { // QP_MAYBE_LATER
                        console.log('maybe later saved');
                        resolve();
                    }
                } else {
                    console.log('user escaped decision');
                    resolve();
                }
            }).catch((reason) => {
                console.log('reject from askForLoginData() or askForDownloadPath()');
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




    async askForDownloadPath(parampath?: string): Promise<string> {
        console.log('IniData.askForDownloadPath');

        return new Promise<string>((resolve, reject) => {
            if(parampath) {
                let _path = parampath;
                if(path.extname(parampath)) {
                    _path = path.dirname(parampath);
                }
                resolve(_path);
            } else {
                let activePath = this.getActivePath();
                let rootPath = vscode.workspace? vscode.workspace.rootPath:'';
                let defaultPath: string = activePath? activePath: rootPath;
                vscode.window.showInputBox({
                    prompt: 'Please enter the download path',
                    value: defaultPath,
                    ignoreFocusOut: true,
                }).then((_path) => {
                    if(_path) {
                        resolve(_path);
                    } else {
                        reject();
                        vscode.window.showErrorMessage('Input download path cancelled: command cannot be executed');
                    }
                });
            }
        });
    }


    // todo load current file
    async loadConfiguration(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: 'Please enter the file',
                ignoreFocusOut: true,
            }).then((file) => {
                if(file) {
                    let _file = file.replace(/"/g, '');
                    this.loadIniFile(_file);
                    vscode.window.setStatusBarMessage('Configuration loaded');
                    resolve();
                }
            });
        });
    }


    public loadIniFile(parampath?: string): boolean {
        console.log('IniData.loadIniFile');

        let file = this.findIniFileInFolder(parampath);
        if(!file) {
            let activePath = this.getActivePath();
            file = this.findIniFileInFolder(activePath);
            if(!file) {
                file = this.findIniFileInFolder(vscode.workspace.rootPath);
                if(!file) {
                    return false;
                }
            }
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

    async writeIniFile(parampath: string): Promise<void> {
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
        return writeFileMkdir(parampath, data);
    }


    public getActivePath(): string {
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

    public findIniFileInFolder(parampath: string): string {
        console.log('IniData.findIniFile');
        if(!parampath) {
            return '';
        }

        let ini = '';
        let ext = path.extname(parampath);
        if('.ini' === ext) {
            ini = parampath;
        } else if('' === ext) {
            ini = path.join(parampath, INI_DEFAULT_NAME);
        } else {
            return '';
        }

        try {
            fs.accessSync(ini);
            return ini;
        } catch (e) {
            return '';
        }
    }

    dispose() {
        //
    }
}
