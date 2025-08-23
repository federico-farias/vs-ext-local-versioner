import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const SftpClient = require('ssh2-sftp-client');

export interface SSHConfig {
    host: string;
    port: number;
    username: string;
    privateKey?: string;
    password?: string;
    remotePath: string;
}

export class SSHManager {
    private config: SSHConfig | null = null;

    async configureSSH(): Promise<SSHConfig | undefined> {
        // Configurar conexión SSH paso a paso
        const host = await vscode.window.showInputBox({
            prompt: 'Dirección IP o hostname del servidor',
            placeHolder: 'ejemplo: 192.168.1.100 o servidor.empresa.com'
        });
        if (!host) return undefined;

        const portStr = await vscode.window.showInputBox({
            prompt: 'Puerto SSH (por defecto 22)',
            value: '22',
            placeHolder: '22'
        });
        if (!portStr) return undefined;
        const port = parseInt(portStr) || 22;

        const username = await vscode.window.showInputBox({
            prompt: 'Usuario SSH',
            placeHolder: 'tu_usuario'
        });
        if (!username) return undefined;

        // Elegir método de autenticación
        const authMethod = await vscode.window.showQuickPick([
            { label: '🔐 Contraseña', description: 'Autenticación con contraseña', value: 'password' },
            { label: '🔑 Clave privada', description: 'Autenticación con archivo de clave privada', value: 'key' }
        ], {
            placeHolder: '¿Cómo te quieres autenticar?'
        });
        if (!authMethod) return undefined;

        let password: string | undefined;
        let privateKey: string | undefined;

        if (authMethod.value === 'password') {
            password = await vscode.window.showInputBox({
                prompt: 'Contraseña SSH',
                password: true
            });
            if (!password) return undefined;
        } else {
            const keyPath = await vscode.window.showInputBox({
                prompt: 'Ruta al archivo de clave privada SSH',
                placeHolder: 'C:\\Users\\tu_usuario\\.ssh\\id_rsa o /home/usuario/.ssh/id_rsa',
                value: process.platform === 'win32' 
                    ? `${process.env.USERPROFILE}\\.ssh\\id_rsa` 
                    : `${process.env.HOME}/.ssh/id_rsa`
            });
            if (!keyPath) return undefined;

            try {
                privateKey = fs.readFileSync(keyPath, 'utf8');
            } catch (error) {
                vscode.window.showErrorMessage(`Error leyendo clave privada: ${(error as Error).message}`);
                return undefined;
            }
        }

        const remotePath = await vscode.window.showInputBox({
            prompt: 'Ruta en el servidor donde guardar las versiones',
            placeHolder: '/home/usuario/versiones_codigo o /var/backups/proyecto',
            value: '/home/' + username + '/versiones_codigo'
        });
        if (!remotePath) return undefined;

        const config: SSHConfig = {
            host,
            port,
            username,
            password,
            privateKey,
            remotePath
        };

        this.config = config;
        return config;
    }

    async testConnection(config: SSHConfig): Promise<boolean> {
        const sftp = new SftpClient();
        try {
            await sftp.connect({
                host: config.host,
                port: config.port,
                username: config.username,
                password: config.password,
                privateKey: config.privateKey
            });

            // Verificar que el directorio remoto existe o crearlo
            try {
                await sftp.stat(config.remotePath);
            } catch (error) {
                // Si no existe, intentar crearlo
                await sftp.mkdir(config.remotePath, true);
                vscode.window.showInformationMessage(`Directorio creado en servidor: ${config.remotePath}`);
            }

            await sftp.end();
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Error conectando al servidor: ${(error as Error).message}`);
            return false;
        }
    }

    async uploadVersions(localVersionsPath: string, projectName: string): Promise<boolean> {
        if (!this.config) {
            vscode.window.showErrorMessage('Primero debes configurar la conexión SSH');
            return false;
        }

        const sftp = new SftpClient();
        try {
            await sftp.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                privateKey: this.config.privateKey
            });

            const remoteProjectPath = `${this.config.remotePath}/${projectName}`;
            
            // Crear carpeta del proyecto en el servidor
            try {
                await sftp.mkdir(remoteProjectPath, true);
            } catch (error) {
                // El directorio puede ya existir, continuar
            }

            // Subir toda la carpeta de versiones
            await sftp.uploadDir(localVersionsPath, remoteProjectPath);

            await sftp.end();
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Error subiendo versiones: ${(error as Error).message}`);
            return false;
        }
    }

    async downloadVersions(localVersionsPath: string, projectName: string): Promise<boolean> {
        if (!this.config) {
            vscode.window.showErrorMessage('Primero debes configurar la conexión SSH');
            return false;
        }

        const sftp = new SftpClient();
        try {
            await sftp.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                privateKey: this.config.privateKey
            });

            const remoteProjectPath = `${this.config.remotePath}/${projectName}`;
            
            // Verificar que existe el directorio remoto
            try {
                await sftp.stat(remoteProjectPath);
            } catch (error) {
                vscode.window.showWarningMessage(`No se encontraron versiones del proyecto ${projectName} en el servidor`);
                await sftp.end();
                return false;
            }

            // Crear carpeta local si no existe
            if (!fs.existsSync(localVersionsPath)) {
                fs.mkdirSync(localVersionsPath, { recursive: true });
            }

            // Descargar toda la carpeta de versiones
            await sftp.downloadDir(remoteProjectPath, localVersionsPath);

            await sftp.end();
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Error descargando versiones: ${(error as Error).message}`);
            return false;
        }
    }

    async downloadSingleVersion(localVersionsPath: string, projectName: string, versionName: string): Promise<boolean> {
        if (!this.config) {
            vscode.window.showErrorMessage('Primero debes configurar la conexión SSH');
            return false;
        }

        const sftp = new SftpClient();
        try {
            await sftp.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                privateKey: this.config.privateKey
            });

            const remoteVersionPath = `${this.config.remotePath}/${projectName}/${versionName}`;
            const localVersionPath = path.join(localVersionsPath, versionName);
            
            // Verificar que existe la versión remota específica
            try {
                await sftp.stat(remoteVersionPath);
            } catch (error) {
                vscode.window.showWarningMessage(`No se encontró la versión ${versionName} del proyecto ${projectName} en el servidor`);
                await sftp.end();
                return false;
            }

            // Crear carpeta local para la versión si no existe
            if (!fs.existsSync(localVersionPath)) {
                fs.mkdirSync(localVersionPath, { recursive: true });
            }

            // Descargar solo esta versión específica
            await sftp.downloadDir(remoteVersionPath, localVersionPath);

            await sftp.end();
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Error descargando versión ${versionName}: ${(error as Error).message}`);
            return false;
        }
    }

    async listRemoteVersions(projectName: string): Promise<string[]> {
        if (!this.config) {
            vscode.window.showErrorMessage('Primero debes configurar la conexión SSH');
            return [];
        }

        const sftp = new SftpClient();
        try {
            await sftp.connect({
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                password: this.config.password,
                privateKey: this.config.privateKey
            });

            const remoteProjectPath = `${this.config.remotePath}/${projectName}`;
            
            try {
                const files = await sftp.list(remoteProjectPath);
                await sftp.end();
                return files
                    .filter((file: any) => file.type === 'd' && file.name.startsWith('v_'))
                    .map((file: any) => file.name)
                    .sort()
                    .reverse();
            } catch (error) {
                await sftp.end();
                return [];
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error listando versiones remotas: ${(error as Error).message}`);
            return [];
        }
    }

    getConfig(): SSHConfig | null {
        return this.config;
    }

    setConfig(config: SSHConfig): void {
        this.config = config;
    }
}