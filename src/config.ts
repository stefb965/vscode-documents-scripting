
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse, ParsedPath, sep, dirname } from 'path';

const INI_NAME: string = 'default.ini';
const INI_CONN_PART: string = '[Connection]';
const INIPATH: string = '[INIPATH]';








async function writeFileMkdir (file, data) {
    let path = dirname(file);
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





export class IniData {
    // todo private + getter...

    // login data
    // Don't rename!
    public server: string = '';
    public port: number = 0;
    public principal: string = '';
    public user: string = '';
    public password: string = '';

    // path for up- and download all
    public localpath: string = '';

    // const
    // windows eol
    private eol: string = '\r\n';

    constructor () {
        //
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
                    console.log('askForLoginData failed: ' + reason);
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
                });
            }
        });
    }


    async askForLoginData(): Promise<void> {
        console.log('IniData.askForLoginData');

        return new Promise<void>((resolve, reject) => {
            // showQuickPick() and showInputBox() return thenable(value) objects,
            // that is, these objects always have a then(value) function,
            // but value can be undefined
            vscode.window.showInputBox({
                prompt: 'Please enter the server',
                ignoreFocusOut: true,
            }).then((server) => {
                this.server = server;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the port',
                    ignoreFocusOut: true,
                });
            }).then((port) => {
                this.port = Number(port);
                return vscode.window.showInputBox({
                    prompt: 'Please enter the principal',
                    ignoreFocusOut: true,
                });
            }).then((principal) => {
                this.principal = principal;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the user',
                    ignoreFocusOut: true,
                });
            }).then((user) => {
                this.user = user;
                return vscode.window.showInputBox({
                    prompt: 'Please enter the password',
                    password: true,
                    ignoreFocusOut: true,
                });
            }).then((password) => {
                this.password = password;
                return vscode.window.showQuickPick([
                    'Create default.ini',
                    'Maybe later'
                ]);
            }).then((decision) => {
                if('Create default.ini' === decision) {
                    this.askForDownloadPath().then(() => {
                        return this.writeIniFile(this.localpath);
                    }).then(() => {
                        console.log('writeIniFile successful');
                        resolve();
                    }).catch((reason) => {
                        console.log('askForDownloadPath or writeIniFile failed: ' + reason);
                        reject(reason);
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    async askForDownloadPath(): Promise<void> {
        console.log('IniData.askForDownloadPath');
        return new Promise<void>((resolve, reject) => {
            vscode.window.showInputBox({
                prompt: 'Please enter the download path',
                ignoreFocusOut: true,
            }).then((localpath) => {
                // todo chek path
                this.localpath = localpath;
                resolve();
            });
        });
    }



    public iniFile:string   = '';
    public iniPath:string   = '';

    public loadIniFile(): boolean {
        console.log('IniData.loadIniFile');
        let path = this.getActivePath();
        let file = this.findIni(path);
        if(!file) {
            return false;
        }

        this.iniPath = path;
        this.iniFile = file;

        let contentBuf = fs.readFileSync(file, 'utf8');
        let contentStr = contentBuf.toString();
        let lines = contentStr.split(this.eol);
        if(INI_CONN_PART === lines[0]) {
            for(let i=1; i<lines.length; i++) {
                let line = lines[i].split('=');
                if(this[line[0]] !== undefined) {
                    switch(line[0]) {
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
                    console.log(line[0] + ': ' + line[1]);
                }
            }
        }
        return true;
    }

    async writeIniFile(path: string): Promise<void> {
        console.log('IniData.writeIniFile');
        let inifile = '';
        inifile += INI_CONN_PART + this.eol;
        inifile += 'server=' + this.server + this.eol;
        inifile += 'port=' + this.port + this.eol;
        inifile += 'principal=' + this.principal + this.eol;
        inifile += 'user=' + this.user + this.eol;
        inifile += 'password=' + this.password + this.eol;
        inifile += 'localpath=' + INIPATH + this.eol;
        return writeFileMkdir(path + '\\default.ini', inifile);
    }

    public getActivePath(): string {
        console.log('IniData.getActivePath');
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        let file = editor.document.fileName;
        const parsedPath = parse(file);
        return parsedPath.dir;
    }

    public findIni(path: string): string {
        console.log('IniData.findIni');
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
