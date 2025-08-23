import * as fs from 'fs';
import * as path from 'path';

export interface VersionInfo {
    id: string;
    timestamp: string;
    description: string;
    filePath: string;
    size: number;
    type: 'full' | 'selective';
    selectedFolders?: string[];
}

export class VersionManager {
    async saveVersionInfo(versionsPath: string, versionInfo: VersionInfo): Promise<void> {
        const versionsFile = path.join(versionsPath, 'versions.json');
        let versions: VersionInfo[] = [];

        if (fs.existsSync(versionsFile)) {
            const content = fs.readFileSync(versionsFile, 'utf-8');
            try {
                versions = JSON.parse(content);
            } catch (e) {
                versions = [];
            }
        }

        versions.push(versionInfo);
        versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        fs.writeFileSync(versionsFile, JSON.stringify(versions, null, 2));
    }

    async getVersions(versionsPath: string): Promise<VersionInfo[]> {
        const versionsFile = path.join(versionsPath, 'versions.json');
        
        if (!fs.existsSync(versionsFile)) {
            return [];
        }

        const content = fs.readFileSync(versionsFile, 'utf-8');
        try {
            return JSON.parse(content);
        } catch (e) {
            return [];
        }
    }

    async cleanOldVersions(versionsPath: string, maxVersions: number): Promise<void> {
        const versionsFile = path.join(versionsPath, 'versions.json');
        
        if (!fs.existsSync(versionsFile)) {
            return;
        }

        const content = fs.readFileSync(versionsFile, 'utf-8');
        let versions: VersionInfo[] = [];
        
        try {
            versions = JSON.parse(content);
        } catch (e) {
            return;
        }

        if (versions.length > maxVersions) {
            const versionsToDelete = versions.slice(maxVersions);
            const versionsToKeep = versions.slice(0, maxVersions);

            // Eliminar carpetas de versiones antiguas
            versionsToDelete.forEach(version => {
                if (fs.existsSync(version.filePath)) {
                    fs.rmSync(version.filePath, { recursive: true, force: true });
                }
            });

            // Actualizar archivo de versiones
            fs.writeFileSync(versionsFile, JSON.stringify(versionsToKeep, null, 2));
        }
    }

    async calculateFolderSize(folderPath: string): Promise<number> {
        let totalSize = 0;

        const calculateRecursive = (dirPath: string) => {
            const items = fs.readdirSync(dirPath);
            items.forEach((item: string) => {
                const fullPath = path.join(dirPath, item);
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    calculateRecursive(fullPath);
                } else {
                    totalSize += stats.size;
                }
            });
        };

        if (fs.existsSync(folderPath)) {
            calculateRecursive(folderPath);
        }
        
        return totalSize;
    }

    initializeVersionsFolder(workspacePath: string, versionsPath: string): void {
        const fullVersionsPath = path.join(workspacePath, versionsPath);
        
        if (!fs.existsSync(fullVersionsPath)) {
            fs.mkdirSync(fullVersionsPath, { recursive: true });
            
            // Crear archivo .gitignore
            const gitignorePath = path.join(fullVersionsPath, '.gitignore');
            fs.writeFileSync(gitignorePath, '*\n!.gitignore\n');
        }
    }
}