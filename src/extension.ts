import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import * as extract from 'extract-zip';

interface VersionInfo {
    id: string;
    timestamp: string;
    description: string;
    filePath: string;
    size: number;
}

interface LocalVersionerConfig {
    googleDrivePath: string;
    versionsPath: string;
    excludePatterns: string[];
    maxVersions: number;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Local Versioner extension is now active!');

    // Registrar todos los comandos
    const commands = [
        vscode.commands.registerCommand('localVersioner.createSnapshot', createSnapshot),
        vscode.commands.registerCommand('localVersioner.listVersions', listVersions),
        vscode.commands.registerCommand('localVersioner.syncToGoogleDrive', syncToGoogleDrive),
        vscode.commands.registerCommand('localVersioner.restoreVersion', restoreVersion),
        vscode.commands.registerCommand('localVersioner.configureSettings', configureSettings)
    ];

    commands.forEach(command => context.subscriptions.push(command));

    // Crear carpeta de versiones si no existe
    initializeVersionsFolder();
}

async function getConfig(): Promise<LocalVersionerConfig> {
    const config = vscode.workspace.getConfiguration('localVersioner');
    return {
        googleDrivePath: config.get<string>('googleDrivePath', ''),
        versionsPath: config.get<string>('versionsPath', '.local-versions'),
        excludePatterns: config.get<string[]>('excludePatterns', ['node_modules', '.git', '*.log', 'tmp', 'temp']),
        maxVersions: config.get<number>('maxVersions', 50)
    };
}

async function getWorkspacePath(): Promise<string> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        throw new Error('No workspace folder is open');
    }
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

async function initializeVersionsFolder(): Promise<void> {
    try {
        const workspacePath = await getWorkspacePath();
        const config = await getConfig();
        const versionsPath = path.join(workspacePath, config.versionsPath);
        
        if (!fs.existsSync(versionsPath)) {
            fs.mkdirSync(versionsPath, { recursive: true });
            
            // Crear archivo .gitignore para excluir las versiones del control de versiones
            const gitignorePath = path.join(versionsPath, '.gitignore');
            fs.writeFileSync(gitignorePath, '*\n!.gitignore\n');
        }
    } catch (error) {
        console.log('Could not initialize versions folder:', error);
    }
}

async function createSnapshot(): Promise<void> {
    try {
        const workspacePath = await getWorkspacePath();
        const config = await getConfig();
        const versionsPath = path.join(workspacePath, config.versionsPath);

        // Solicitar descripción del snapshot
        const description = await vscode.window.showInputBox({
            prompt: 'Descripción del snapshot (opcional)',
            placeHolder: 'Ej: Implementación de nueva funcionalidad X'
        });

        if (description === undefined) {
            return; // Usuario canceló
        }

        // Generar ID único para la versión
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const versionId = `v_${timestamp}`;
        const zipPath = path.join(versionsPath, `${versionId}.zip`);

        // Crear progreso
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Creando snapshot...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Recopilando archivos...' });

            // Crear ZIP con los archivos del workspace
            await createZipFromWorkspace(workspacePath, zipPath, config.excludePatterns);

            progress.report({ increment: 50, message: 'Guardando metadatos...' });

            // Guardar información de la versión
            const versionInfo: VersionInfo = {
                id: versionId,
                timestamp: new Date().toISOString(),
                description: description || 'Sin descripción',
                filePath: zipPath,
                size: fs.statSync(zipPath).size
            };

            await saveVersionInfo(versionsPath, versionInfo);
            await cleanOldVersions(versionsPath, config.maxVersions);

            progress.report({ increment: 100, message: 'Completado' });
        });

        const sizeInMB = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(2);
        vscode.window.showInformationMessage(
            `Snapshot creado exitosamente: ${versionId} (${sizeInMB} MB)`
        );

    } catch (error) {
        vscode.window.showErrorMessage(`Error creando snapshot: ${error}`);
    }
}

async function createZipFromWorkspace(workspacePath: string, zipPath: string, excludePatterns: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));

        archive.pipe(output);

        // Función para verificar si un archivo debe ser excluido
        const shouldExclude = (filePath: string): boolean => {
            const relativePath = path.relative(workspacePath, filePath);
            return excludePatterns.some(pattern => {
                if (pattern.includes('*')) {
                    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
                    return regex.test(relativePath);
                }
                return relativePath.includes(pattern);
            });
        };

        // Agregar archivos al ZIP recursivamente
        const addDirectory = (dirPath: string) => {
            const items = fs.readdirSync(dirPath);
            
            items.forEach(item => {
                const fullPath = path.join(dirPath, item);
                
                if (shouldExclude(fullPath)) {
                    return;
                }

                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    addDirectory(fullPath);
                } else if (stats.isFile()) {
                    const relativePath = path.relative(workspacePath, fullPath);
                    archive.file(fullPath, { name: relativePath });
                }
            });
        };

        addDirectory(workspacePath);
        archive.finalize();
    });
}

async function saveVersionInfo(versionsPath: string, versionInfo: VersionInfo): Promise<void> {
    const versionsFile = path.join(versionsPath, 'versions.json');
    let versions: VersionInfo[] = [];

    if (fs.existsSync(versionsFile)) {
        const content = fs.readFileSync(versionsFile, 'utf-8');
        versions = JSON.parse(content);
    }

    versions.push(versionInfo);
    versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2));
}

async function cleanOldVersions(versionsPath: string, maxVersions: number): Promise<void> {
    const versionsFile = path.join(versionsPath, 'versions.json');
    
    if (!fs.existsSync(versionsFile)) {
        return;
    }

    const content = fs.readFileSync(versionsFile, 'utf-8');
    const versions: VersionInfo[] = JSON.parse(content);

    if (versions.length > maxVersions) {
        const versionsToDelete = versions.slice(maxVersions);
        const versionsToKeep = versions.slice(0, maxVersions);

        // Eliminar archivos ZIP antiguos
        versionsToDelete.forEach(version => {
            if (fs.existsSync(version.filePath)) {
                fs.unlinkSync(version.filePath);
            }
        });

        // Actualizar archivo de versiones
        fs.writeFileSync(versionsFile, JSON.stringify(versionsToKeep, null, 2));
    }
}

async function listVersions(): Promise<void> {
    try {
        const workspacePath = await getWorkspacePath();
        const config = await getConfig();
        const versionsPath = path.join(workspacePath, config.versionsPath);
        const versionsFile = path.join(versionsPath, 'versions.json');

        if (!fs.existsSync(versionsFile)) {
            vscode.window.showInformationMessage('No hay versiones guardadas todavía.');
            return;
        }

        const content = fs.readFileSync(versionsFile, 'utf-8');
        const versions: VersionInfo[] = JSON.parse(content);

        if (versions.length === 0) {
            vscode.window.showInformationMessage('No hay versiones guardadas todavía.');
            return;
        }

        // Crear lista de opciones para QuickPick
        const items = versions.map(version => ({
            label: version.id,
            description: new Date(version.timestamp).toLocaleString(),
            detail: `${version.description} (${(version.size / (1024 * 1024)).toFixed(2)} MB)`,
            version: version
        }));

        const selectedItem = await vscode.window.showQuickPick(items, {
            placeHolder: 'Selecciona una versión para ver detalles'
        });

        if (selectedItem) {
            const version = selectedItem.version;
            const message = `Versión: ${version.id}\n` +
                          `Fecha: ${new Date(version.timestamp).toLocaleString()}\n` +
                          `Descripción: ${version.description}\n` +
                          `Tamaño: ${(version.size / (1024 * 1024)).toFixed(2)} MB`;

            const action = await vscode.window.showInformationMessage(
                message,
                'Restaurar esta versión',
                'Cerrar'
            );

            if (action === 'Restaurar esta versión') {
                await restoreSpecificVersion(version);
            }
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Error listando versiones: ${error}`);
    }
}

async function restoreVersion(): Promise<void> {
    try {
        const workspacePath = await getWorkspacePath();
        const config = await getConfig();
        const versionsPath = path.join(workspacePath, config.versionsPath);
        const versionsFile = path.join(versionsPath, 'versions.json');

        if (!fs.existsSync(versionsFile)) {
            vscode.window.showInformationMessage('No hay versiones guardadas para restaurar.');
            return;
        }

        const content = fs.readFileSync(versionsFile, 'utf-8');
        const versions: VersionInfo[] = JSON.parse(content);

        if (versions.length === 0) {
            vscode.window.showInformationMessage('No hay versiones guardadas para restaurar.');
            return;
        }

        // Crear lista de opciones para QuickPick
        const items = versions.map(version => ({
            label: version.id,
            description: new Date(version.timestamp).toLocaleString(),
            detail: version.description,
            version: version
        }));

        const selectedItem = await vscode.window.showQuickPick(items, {
            placeHolder: 'Selecciona la versión a restaurar'
        });

        if (selectedItem) {
            await restoreSpecificVersion(selectedItem.version);
        }

    } catch (error) {
        vscode.window.showErrorMessage(`Error restaurando versión: ${error}`);
    }
}

async function restoreSpecificVersion(version: VersionInfo): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
        `¿Estás seguro de que quieres restaurar la versión ${version.id}? Esto sobrescribirá los archivos actuales.`,
        'Sí, restaurar',
        'Cancelar'
    );

    if (confirmed !== 'Sí, restaurar') {
        return;
    }

    try {
        const workspacePath = await getWorkspacePath();
        
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Restaurando versión...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Extrayendo archivos...' });

            // Crear carpeta temporal
            const tempPath = path.join(workspacePath, '.temp-restore');
            if (fs.existsSync(tempPath)) {
                fs.rmSync(tempPath, { recursive: true, force: true });
            }
            fs.mkdirSync(tempPath, { recursive: true });

            // Extraer ZIP
            await extract(version.filePath, { dir: tempPath });

            progress.report({ increment: 50, message: 'Copiando archivos...' });

            // Copiar archivos del temporal al workspace
            const copyRecursive = (src: string, dest: string) => {
                const items = fs.readdirSync(src);
                items.forEach(item => {
                    const srcPath = path.join(src, item);
                    const destPath = path.join(dest, item);
                    
                    if (fs.statSync(srcPath).isDirectory()) {
                        if (!fs.existsSync(destPath)) {
                            fs.mkdirSync(destPath, { recursive: true });
                        }
                        copyRecursive(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                });
            };

            copyRecursive(tempPath, workspacePath);

            // Limpiar carpeta temporal
            fs.rmSync(tempPath, { recursive: true, force: true });

            progress.report({ increment: 100, message: 'Completado' });
        });

        vscode.window.showInformationMessage(`Versión ${version.id} restaurada exitosamente.`);

    } catch (error) {
        vscode.window.showErrorMessage(`Error restaurando versión: ${error}`);
    }
}

async function syncToGoogleDrive(): Promise<void> {
    try {
        const config = await getConfig();
        
        if (!config.googleDrivePath || config.googleDrivePath.trim() === '') {
            const action = await vscode.window.showWarningMessage(
                'No has configurado la ruta de Google Drive. ¿Quieres configurarla ahora?',
                'Configurar',
                'Cancelar'
            );
            
            if (action === 'Configurar') {
                await configureSettings();
            }
            return;
        }

        const workspacePath = await getWorkspacePath();
        const versionsPath = path.join(workspacePath, config.versionsPath);

        if (!fs.existsSync(versionsPath)) {
            vscode.window.showWarningMessage('No hay versiones locales para sincronizar.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Sincronizando con Google Drive...',
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Copiando archivos...' });

            const workspaceName = path.basename(workspacePath);
            const driveVersionsPath = path.join(config.googleDrivePath, `${workspaceName}-versions`);

            // Crear carpeta en Google Drive si no existe
            if (!fs.existsSync(driveVersionsPath)) {
                fs.mkdirSync(driveVersionsPath, { recursive: true });
            }

            // Copiar toda la carpeta de versiones
            const copyRecursive = (src: string, dest: string) => {
                const items = fs.readdirSync(src);
                items.forEach(item => {
                    const srcPath = path.join(src, item);
                    const destPath = path.join(dest, item);
                    
                    if (fs.statSync(srcPath).isDirectory()) {
                        if (!fs.existsSync(destPath)) {
                            fs.mkdirSync(destPath, { recursive: true });
                        }
                        copyRecursive(srcPath, destPath);
                    } else {
                        fs.copyFileSync(srcPath, destPath);
                    }
                });
            };

            copyRecursive(versionsPath, driveVersionsPath);
            progress.report({ increment: 100, message: 'Completado' });
        });

        vscode.window.showInformationMessage('Versiones sincronizadas con Google Drive exitosamente.');

    } catch (error) {
        vscode.window.showErrorMessage(`Error sincronizando con Google Drive: ${error}`);
    }
}

async function configureSettings(): Promise<void> {
    const config = await getConfig();
    
    const googleDrivePath = await vscode.window.showInputBox({
        prompt: 'Ruta completa a tu carpeta de Google Drive',
        value: config.googleDrivePath,
        placeHolder: 'C:\\Users\\tu-usuario\\Google Drive\\Mi unidad'
    });

    if (googleDrivePath !== undefined) {
        await vscode.workspace.getConfiguration('localVersioner').update(
            'googleDrivePath',
            googleDrivePath,
            vscode.ConfigurationTarget.Workspace
        );

        vscode.window.showInformationMessage('Configuración actualizada exitosamente.');
    }
}

export function deactivate() {
    console.log('Local Versioner extension is now deactivated.');
}