import * as fs from 'fs';
import * as path from 'path';

export class FileOperations {
    async copySelectedFolders(sourcePath: string, targetPath: string, selectedFolders: string[], excludePatterns: string[]): Promise<void> {
        for (const folderName of selectedFolders) {
            const srcFolderPath = path.join(sourcePath, folderName);
            const destFolderPath = path.join(targetPath, folderName);
            
            if (fs.existsSync(srcFolderPath)) {
                // Crear carpeta destino
                if (!fs.existsSync(destFolderPath)) {
                    fs.mkdirSync(destFolderPath, { recursive: true });
                }
                
                // Copiar contenido de la carpeta
                await this.copyFolderContents(srcFolderPath, destFolderPath, excludePatterns);
            }
        }
    }

    async copyWorkspaceFiles(sourcePath: string, targetPath: string, excludePatterns: string[]): Promise<void> {
        const shouldExclude = (filePath: string) => {
            const relativePath = path.relative(sourcePath, filePath);
            const fileName = path.basename(filePath);
            
            return excludePatterns.some(pattern => {
                if (pattern.includes('*')) {
                    // Escapar caracteres especiales de regex y convertir * a .*
                    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
                    const regex = new RegExp(escapedPattern);
                    return regex.test(relativePath) || regex.test(fileName);
                }
                // Verificar coincidencia exacta del nombre de archivo o path relativo
                return relativePath === pattern || 
                       fileName === pattern || 
                       relativePath.includes(pattern) ||
                       relativePath.startsWith(pattern + path.sep);
            });
        };

        const copyRecursive = (src: string, dest: string) => {
            if (shouldExclude(src)) {
                return;
            }

            const items = fs.readdirSync(src);
            
            items.forEach((item: string) => {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);
                
                if (shouldExclude(srcPath)) {
                    return;
                }

                const stats = fs.statSync(srcPath);
                
                if (stats.isDirectory()) {
                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(destPath, { recursive: true });
                    }
                    copyRecursive(srcPath, destPath);
                } else if (stats.isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                }
            });
        };

        copyRecursive(sourcePath, targetPath);
    }

    async copyFolderContents(sourcePath: string, targetPath: string, excludePatterns: string[]): Promise<void> {
        const shouldExclude = (filePath: string) => {
            const relativePath = path.relative(sourcePath, filePath);
            const fileName = path.basename(filePath);
            
            return excludePatterns.some(pattern => {
                if (pattern.includes('*')) {
                    // Escapar caracteres especiales de regex y convertir * a .*
                    const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
                    const regex = new RegExp(escapedPattern);
                    return regex.test(relativePath) || regex.test(fileName);
                }
                // Verificar coincidencia exacta del nombre de archivo o path relativo
                return relativePath === pattern || 
                       fileName === pattern || 
                       relativePath.includes(pattern) ||
                       relativePath.startsWith(pattern + path.sep);
            });
        };

        const copyRecursive = (src: string, dest: string) => {
            if (shouldExclude(src)) {
                return;
            }

            const items = fs.readdirSync(src);
            
            items.forEach((item: string) => {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);
                
                if (shouldExclude(srcPath)) {
                    return;
                }

                const stats = fs.statSync(srcPath);
                
                if (stats.isDirectory()) {
                    if (!fs.existsSync(destPath)) {
                        fs.mkdirSync(destPath, { recursive: true });
                    }
                    copyRecursive(srcPath, destPath);
                } else if (stats.isFile()) {
                    fs.copyFileSync(srcPath, destPath);
                }
            });
        };

        copyRecursive(sourcePath, targetPath);
    }

    async restoreVersion(versionPath: string, workspacePath: string): Promise<void> {
        const copyRecursive = (src: string, dest: string) => {
            const items = fs.readdirSync(src);
            items.forEach((item: string) => {
                const srcPath = path.join(src, item);
                const destPath = path.join(dest, item);
                
                // No sobrescribir la carpeta de versiones
                if (item === '.local-versions') {
                    return;
                }
                
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

        copyRecursive(versionPath, workspacePath);
    }

    async syncToBackupFolder(versionsPath: string, backupPath: string, workspaceName: string): Promise<void> {
        const backupVersionsPath = path.join(backupPath, `${workspaceName}-versions`);

        // Crear carpeta en la carpeta de respaldo si no existe
        if (!fs.existsSync(backupVersionsPath)) {
            fs.mkdirSync(backupVersionsPath, { recursive: true });
        }

        // Copiar toda la carpeta de versiones
        const copyRecursive = (src: string, dest: string) => {
            const items = fs.readdirSync(src);
            items.forEach((item: string) => {
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

        copyRecursive(versionsPath, backupVersionsPath);
    }
}