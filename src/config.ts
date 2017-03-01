
import * as vscode from 'vscode';
import * as fs from 'fs';
import { parse, ParsedPath, sep } from 'path';

const INI_NAME: string = 'default.ini';
const INI_CONN_PART: string = '[Connection]';
const INIPATH: string = '[INIPATH]';


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
        return new Promise<void>((resolve, reject) => {
            let inifile = '';
            inifile += 'server=' + this.server + this.eol;
            inifile += 'port=' + this.port + this.eol;
            inifile += 'principal=' + this.principal + this.eol;
            inifile += 'user=' + this.user + this.eol;
            inifile += 'password=' + this.password + this.eol;
            inifile += 'localpath=' + this.localpath + this.eol;
            fs.writeFile(path, inifile, {encoding: 'utf8'}, function(error) {
                if(error) {
                    reject(error);
                }
                resolve();
            });
        });
    }

    public getActivePath(): string {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        let file = editor.document.fileName;
        const parsedPath = parse(file);
        return parsedPath.dir;
    }

    public findIni(path: string): string {
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
