import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface ExtensionConfig {
    backupFolderPath: string;
    versionsPath: string;
    excludePatterns: string[];
    maxVersions: number;
    defaultSnapshotMode: 'ask' | 'full' | 'selective';
    selectedFolders: string[];
}

export interface ProjectConfig extends ExtensionConfig {
    projectName: string;
    createdAt: string;
    version: string;
}

export class ConfigurationManager {
    async getConfig(): Promise<ExtensionConfig> {
        const config = vscode.workspace.getConfiguration('localVersioner');
        return {
            backupFolderPath: config.get('backupFolderPath', ''),
            versionsPath: config.get('versionsPath', '.local-versions'),
            excludePatterns: config.get('excludePatterns', ['node_modules', '.git', '*.log', 'tmp', 'temp']),
            maxVersions: config.get('maxVersions', 50),
            defaultSnapshotMode: config.get('defaultSnapshotMode', 'ask'),
            selectedFolders: config.get('selectedFolders', [])
        };
    }

    async updateConfig(key: keyof ExtensionConfig, value: any): Promise<void> {
        const workspaceConfig = vscode.workspace.getConfiguration('localVersioner');
        await workspaceConfig.update(key, value, vscode.ConfigurationTarget.Workspace);
    }

    async applyProjectConfiguration(config: ProjectConfig): Promise<void> {
        const workspaceConfig = vscode.workspace.getConfiguration('localVersioner');
        
        await workspaceConfig.update('backupFolderPath', config.backupFolderPath, vscode.ConfigurationTarget.Workspace);
        await workspaceConfig.update('versionsPath', config.versionsPath, vscode.ConfigurationTarget.Workspace);
        await workspaceConfig.update('excludePatterns', config.excludePatterns, vscode.ConfigurationTarget.Workspace);
        await workspaceConfig.update('maxVersions', config.maxVersions, vscode.ConfigurationTarget.Workspace);
        await workspaceConfig.update('defaultSnapshotMode', config.defaultSnapshotMode, vscode.ConfigurationTarget.Workspace);
        await workspaceConfig.update('selectedFolders', config.selectedFolders, vscode.ConfigurationTarget.Workspace);
    }

    async loadProjectConfiguration(workspacePath: string): Promise<ProjectConfig | null> {
        try {
            const configFilePath = path.join(workspacePath, '.local-versioner-config.json');
            
            if (!fs.existsSync(configFilePath)) {
                return null;
            }
            
            const content = fs.readFileSync(configFilePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.log('Error loading project configuration:', error);
            return null;
        }
    }

    async saveProjectConfiguration(workspacePath: string, config: ProjectConfig): Promise<void> {
        const configFilePath = path.join(workspacePath, '.local-versioner-config.json');
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
    }

    formatConfigSummary(config: ProjectConfig): string {
        let summary = '';
        summary += `📁 Carpeta de respaldo: ${config.backupFolderPath || 'Solo almacenamiento local (.local-versions)'}\n`;
        summary += `📋 Modo de snapshot: ${this.getModeLabel(config.defaultSnapshotMode)}\n`;
        
        if (config.defaultSnapshotMode === 'selective' && config.selectedFolders.length > 0) {
            summary += `📂 Carpetas incluidas: ${config.selectedFolders.join(', ')}\n`;
        }
        
        summary += `🗂️ Máximo de versiones: ${config.maxVersions}\n`;
        summary += `🚫 Patrones excluidos: ${config.excludePatterns.slice(0, 3).join(', ')}${config.excludePatterns.length > 3 ? '...' : ''}`;
        
        return summary;
    }

    private getModeLabel(mode: string): string {
        switch (mode) {
            case 'full': return '📦 Proyecto completo';
            case 'selective': return '📁 Carpetas específicas';
            case 'ask': return '❓ Preguntar cada vez';
            default: return mode;
        }
    }
}