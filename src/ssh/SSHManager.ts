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

    async downloadSingleVersionWithProgress(
        localVersionsPath: string, 
        projectName: string, 
        versionName: string, 
        progressCallback?: (transferred: number, total: number, filename: string) => void
    ): Promise<boolean> {
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

            // Mostrar progreso mientras se escanean los archivos remotos
            const remoteFiles = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: '🔍 Analizando archivos en servidor...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Escaneando estructura de carpetas...' });
                
                let scannedFolders = 0;
                const files = await this.getRemoteFileListWithProgress(
                    sftp, 
                    remoteVersionPath,
                    (folderCount: number, currentFolder: string) => {
                        scannedFolders++;
                        progress.report({ 
                            increment: Math.min(10, 90 / Math.max(folderCount, 1)),
                            message: `Analizando: ${path.basename(currentFolder)} (${scannedFolders} carpetas)` 
                        });
                    }
                );
                
                progress.report({ increment: 100, message: `✅ ${files.length} archivos encontrados` });
                return files;
            });

            const totalSize = remoteFiles.reduce((sum, file) => sum + file.size, 0);
            let completedFiles = 0;
            let transferredSize = 0;

            // Configurar eventos de progreso si se proporciona callback
            if (progressCallback) {
                sftp.on('download', (info: any) => {
                    const fileName = path.basename(info.source || 'archivo');
                    const completedFile = remoteFiles.find(file => 
                        file.name.includes(fileName) || fileName.includes(path.basename(file.name))
                    );
                    
                    if (completedFile) {
                        completedFiles++;
                        transferredSize += completedFile.size;
                        progressCallback(transferredSize, totalSize, fileName);
                    } else {
                        const avgFileSize = totalSize / remoteFiles.length;
                        transferredSize += avgFileSize;
                        progressCallback(transferredSize, totalSize, fileName);
                    }
                });
            }

            // Descargar la carpeta completa con eventos de progreso
            await sftp.downloadDir(remoteVersionPath, localVersionPath);

            await sftp.end();
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Error descargando versión ${versionName}: ${(error as Error).message}`);
            return false;
        }
    }

    private async getRemoteFileListWithProgress(
        sftp: any, 
        remotePath: string, 
        progressCallback?: (folderCount: number, currentFolder: string) => void
    ): Promise<Array<{name: string, size: number}>> {
        const fileList: Array<{name: string, size: number}> = [];
        let folderCount = 0;
        
        const scanRecursively = async (currentPath: string): Promise<void> => {
            try {
                folderCount++;
                if (progressCallback) {
                    progressCallback(folderCount, currentPath);
                }

                const items = await sftp.list(currentPath);
                
                for (const item of items) {
                    if (item.type === '-') { 
                        // Es un archivo
                        fileList.push({ 
                            name: `${currentPath}/${item.name}`, 
                            size: item.size 
                        });
                    } else if (item.type === 'd') { 
                        // Es un directorio - escanear recursivamente
                        const subPath = `${currentPath}/${item.name}`;
                        await scanRecursively(subPath);
                    }
                }
            } catch (error) {
                console.log(`Error scanning remote folder ${currentPath}:`, error);
            }
        };

        await scanRecursively(remotePath);
        return fileList;
    }

    private async getRemoteFileList(sftp: any, remotePath: string): Promise<Array<{name: string, size: number}>> {
        const fileList: Array<{name: string, size: number}> = [];
        
        try {
            const items = await sftp.list(remotePath);
            
            for (const item of items) {
                if (item.type === '-') { // Es un archivo
                    fileList.push({ name: item.name, size: item.size });
                } else if (item.type === 'd') { // Es un directorio
                    const subPath = `${remotePath}/${item.name}`;
                    const subFiles = await this.getRemoteFileList(sftp, subPath);
                    fileList.push(...subFiles);
                }
            }
        } catch (error) {
            console.log('Error listing remote files:', error);
        }
        
        return fileList;
    }

    // Mantener el método original para compatibilidad
    async downloadSingleVersion(localVersionsPath: string, projectName: string, versionName: string): Promise<boolean> {
        return this.downloadSingleVersionWithProgress(localVersionsPath, projectName, versionName);
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