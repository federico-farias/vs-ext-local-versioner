import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ExtensionConfig, ProjectConfig } from '../config/ConfigurationManager';
import { VersionInfo } from '../version/VersionManager';

interface FolderItem {
    label: string;
    description: string;
    detail: string;
    folder: string;
    picked: boolean;
}

export class UIManager {
    async showWelcomeMessage(): Promise<'setup' | 'later' | undefined> {
        const result = await vscode.window.showInformationMessage(
            '¡Bienvenido a Local Versioner! 🎉\n\nEsta es la primera vez que usas la extensión en este proyecto. ¿Te gustaría configurarla ahora para una mejor experiencia?',
            'Sí, configurar ahora',
            'Configurar más tarde'
        );

        if (result === 'Sí, configurar ahora') return 'setup';
        if (result === 'Configurar más tarde') return 'later';
        return undefined;
    }

    async getBackupFolderPath(currentPath: string = ''): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt: 'Ruta completa a tu carpeta de respaldo (opcional)',
            value: currentPath,
            placeHolder: 'C:\\Users\\tu-usuario\\Google Drive\\Respaldos - Dejar vacío para usar solo carpeta local'
        });
    }

    async getSnapshotMode(): Promise<{ label: string; value: 'ask' | 'full' | 'selective' } | undefined> {
        return await vscode.window.showQuickPick([
            {
                label: '📦 Proyecto completo',
                description: 'Siempre crear snapshots del proyecto completo',
                detail: 'Recomendado para proyectos pequeños o cuando quieres versionar todo',
                value: 'full' as const
            },
            {
                label: '📁 Carpetas específicas',
                description: 'Usar carpetas preconfiguradas para snapshots',
                detail: 'Recomendado para proyectos grandes donde solo versiones ciertas carpetas',
                value: 'selective' as const
            },
            {
                label: '❓ Preguntar cada vez',
                description: 'Pregunta qué tipo de snapshot crear cada vez',
                detail: 'Máxima flexibilidad, pero requiere decisión en cada snapshot',
                value: 'ask' as const
            }
        ], {
            placeHolder: 'Selecciona el modo por defecto para crear snapshots'
        });
    }

    async selectFolders(workspacePath: string, excludePatterns: string[], currentSelection: string[] = []): Promise<string[] | undefined> {
        const rootItems: FolderItem[] = fs.readdirSync(workspacePath, { withFileTypes: true })
            .filter((dirent: fs.Dirent) => dirent.isDirectory() && 
                    dirent.name !== '.local-versions' && 
                    !excludePatterns.some(pattern => dirent.name.includes(pattern)))
            .map((dirent: fs.Dirent) => ({
                label: `📁 ${dirent.name}`,
                description: currentSelection.includes(dirent.name) ? '✅ Seleccionada' : '',
                detail: `Carpeta: ${dirent.name}`,
                folder: dirent.name,
                picked: currentSelection.includes(dirent.name)
            }));

        if (rootItems.length === 0) {
            vscode.window.showWarningMessage('No se encontraron carpetas válidas para seleccionar.');
            return undefined;
        }

        const quickPick = vscode.window.createQuickPick<FolderItem>();
        quickPick.items = rootItems;
        quickPick.canSelectMany = true;
        quickPick.selectedItems = rootItems.filter((item: FolderItem) => item.picked);
        quickPick.placeholder = 'Selecciona las carpetas que siempre quieres incluir en snapshots selectivos';
        quickPick.title = 'Configurar carpetas por defecto';

        return new Promise((resolve) => {
            quickPick.onDidAccept(() => {
                resolve(quickPick.selectedItems.map((item: FolderItem) => item.folder));
                quickPick.hide();
            });
            quickPick.onDidHide(() => {
                resolve(undefined);
            });
            quickPick.show();
        });
    }

    async getSnapshotDescription(defaultDescription: string): Promise<string | undefined> {
        return await vscode.window.showInputBox({
            prompt: 'Descripción del snapshot (opcional)',
            placeHolder: defaultDescription
        });
    }

    async chooseSnapshotType(): Promise<{ label: string; value: 'full' | 'selective' } | undefined> {
        return await vscode.window.showQuickPick([
            {
                label: '📦 Proyecto completo',
                description: 'Crear snapshot de todo el proyecto',
                detail: 'Incluye todos los archivos y carpetas (excepto los excluidos)',
                value: 'full' as const
            },
            {
                label: '📁 Carpetas específicas',
                description: 'Seleccionar carpetas específicas para incluir',
                detail: 'Permite elegir qué carpetas incluir en el snapshot',
                value: 'selective' as const
            }
        ], {
            placeHolder: '¿Qué tipo de snapshot quieres crear?'
        });
    }

    async selectVersion(versions: VersionInfo[]): Promise<VersionInfo | undefined> {
        const items = versions.map(version => {
            const typeIcon = version.type === 'selective' ? '📁' : '📦';
            const typeText = version.type === 'selective' ? 'Parcial' : 'Completo';
            const folderInfo = version.selectedFolders ? ` [${version.selectedFolders.join(', ')}]` : '';
            
            return {
                label: `${typeIcon} ${version.id}`,
                description: `${typeText} - ${new Date(version.timestamp).toLocaleString()}`,
                detail: `${version.description}${folderInfo} (${(version.size / (1024 * 1024)).toFixed(2)} MB)`,
                version: version
            };
        });

        const selectedItem = await vscode.window.showQuickPick(items, {
            placeHolder: 'Selecciona una versión para ver detalles'
        });

        return selectedItem?.version;
    }

    async showVersionDetails(version: VersionInfo): Promise<'restore' | undefined> {
        const typeText = version.type === 'selective' ? 'Snapshot parcial' : 'Snapshot completo';
        const foldersList = version.selectedFolders ? `\nCarpetas incluidas: ${version.selectedFolders.join(', ')}` : '';
        
        const message = `Versión: ${version.id}\n` +
                      `Tipo: ${typeText}\n` +
                      `Fecha: ${new Date(version.timestamp).toLocaleString()}\n` +
                      `Descripción: ${version.description}${foldersList}\n` +
                      `Tamaño: ${(version.size / (1024 * 1024)).toFixed(2)} MB`;

        const action = await vscode.window.showInformationMessage(
            message,
            'Restaurar esta versión',
            'Cerrar'
        );

        return action === 'Restaurar esta versión' ? 'restore' : undefined;
    }

    async confirmRestore(versionId: string): Promise<boolean> {
        const confirmed = await vscode.window.showWarningMessage(
            `¿Estás seguro de que quieres restaurar la versión ${versionId}? Esto sobrescribirá los archivos actuales.`,
            'Sí, restaurar',
            'Cancelar'
        );

        return confirmed === 'Sí, restaurar';
    }

    async showConfigurationSummary(config: ProjectConfig): Promise<'save' | 'manual' | undefined> {
        const configSummary = this.formatConfigSummary(config);
        
        const result = await vscode.window.showInformationMessage(
            `Configuración completada para "${config.projectName}":\n\n${configSummary}\n\n¿Quieres guardar esta configuración?`,
            'Sí, guardar configuración',
            'No, configurar manualmente'
        );

        if (result === 'Sí, guardar configuración') return 'save';
        if (result === 'No, configurar manualmente') return 'manual';
        return undefined;
    }

    async askAboutGitignore(): Promise<boolean> {
        const result = await vscode.window.showQuickPick([
            { label: 'Sí', description: 'Excluir configuración del control de versiones' },
            { label: 'No', description: 'Incluir configuración en el control de versiones' }
        ], {
            placeHolder: '¿Quieres excluir el archivo de configuración (.local-versioner-config.json) del control de versiones?'
        });

        return result?.label === 'Sí';
    }

    async showBackupFolderPrompt(): Promise<'configure' | 'local' | undefined> {
        const result = await vscode.window.showInformationMessage(
            'No tienes configurada una carpeta de respaldo externa. Las versiones se guardan solo en .local-versions.\n\n¿Quieres configurar una carpeta de respaldo externa ahora?',
            'Configurar carpeta de respaldo',
            'Mantener solo local',
            'Cancelar'
        );

        if (result === 'Configurar carpeta de respaldo') return 'configure';
        if (result === 'Mantener solo local') return 'local';
        return undefined;
    }

    showProgress<T>(
        title: string,
        task: (progress: vscode.Progress<{ increment?: number; message?: string }>) => Promise<T>
    ): Promise<T> {
        return Promise.resolve(vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        }, task));
    }

    async showProgressWithPercentage<T>(title: string, task: (progress: vscode.Progress<{message?: string, increment?: number}>) => Promise<T>): Promise<T> {
        let currentPercentage = 0;
        
        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: title,
            cancellable: false
        }, async (progress) => {
            const wrappedProgress = {
                report: (value: {message?: string, increment?: number}) => {
                    if (value.increment) {
                        currentPercentage += value.increment;
                    }
                    
                    const message = value.message 
                        ? `[${Math.round(currentPercentage)}%] ${value.message}`
                        : `[${Math.round(currentPercentage)}%] En progreso...`;
                    
                    progress.report({
                        message: message,
                        increment: value.increment
                    });
                }
            };
            
            return await task(wrappedProgress);
        });
    }

    showSuccessMessage(message: string): void {
        vscode.window.showInformationMessage(message);
    }

    showErrorMessage(message: string): void {
        vscode.window.showErrorMessage(message);
    }

    showWarningMessage(message: string): void {
        vscode.window.showWarningMessage(message);
    }

    private formatConfigSummary(config: ProjectConfig): string {
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