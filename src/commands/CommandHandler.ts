import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager, ProjectConfig } from '../config/ConfigurationManager';
import { VersionManager, VersionInfo } from '../version/VersionManager';
import { FileOperations } from '../file/FileOperations';
import { UIManager } from '../ui/UIManager';

export class CommandHandler {
    private configManager: ConfigurationManager;
    private versionManager: VersionManager;
    private fileOps: FileOperations;
    private uiManager: UIManager;

    constructor() {
        this.configManager = new ConfigurationManager();
        this.versionManager = new VersionManager();
        this.fileOps = new FileOperations();
        this.uiManager = new UIManager();
    }

    async getWorkspacePath(): Promise<string> {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            throw new Error('No workspace folder is open');
        }
        return vscode.workspace.workspaceFolders[0].uri.fsPath;
    }

    async createSnapshot(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);

            let snapshotMode = config.defaultSnapshotMode;
            let selectedFolders: string[] = [];

            // Determinar el modo de snapshot según la configuración
            if (snapshotMode === 'ask') {
                const snapshotType = await this.uiManager.chooseSnapshotType();
                if (!snapshotType) return; // Usuario canceló
                snapshotMode = snapshotType.value;
            }

            if (snapshotMode === 'selective') {
                if (config.selectedFolders && config.selectedFolders.length > 0) {
                    selectedFolders = this.validateSelectedFolders(workspacePath, config.selectedFolders);
                    if (selectedFolders.length === 0) {
                        this.uiManager.showWarningMessage('Las carpetas configuradas no existen en el proyecto actual. Usa "Configurar Local Versioner" para actualizarlas.');
                        return;
                    }
                } else {
                    const folders = await this.uiManager.selectFolders(workspacePath, config.excludePatterns);
                    if (!folders || folders.length === 0) return; // Usuario canceló
                    selectedFolders = folders;
                }
            }

            const defaultDescription = snapshotMode === 'selective' 
                ? `Snapshot de carpetas: ${selectedFolders.join(', ')}`
                : 'Snapshot completo del proyecto';

            const description = await this.uiManager.getSnapshotDescription(defaultDescription);
            if (description === undefined) return; // Usuario canceló

            await this.createSnapshotProcess(workspacePath, versionsPath, snapshotMode, selectedFolders, description || defaultDescription, config);

        } catch (error) {
            this.uiManager.showErrorMessage(`Error creando snapshot: ${(error as Error).message}`);
        }
    }

    async listVersions(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);

            const versions = await this.versionManager.getVersions(versionsPath);

            if (versions.length === 0) {
                this.uiManager.showSuccessMessage('No hay versiones guardadas todavía.');
                return;
            }

            const selectedVersion = await this.uiManager.selectVersion(versions);
            if (!selectedVersion) return;

            const action = await this.uiManager.showVersionDetails(selectedVersion);
            if (action === 'restore') {
                await this.restoreSpecificVersion(selectedVersion);
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error listando versiones: ${(error as Error).message}`);
        }
    }

    async syncToBackupFolder(): Promise<void> {
        try {
            const config = await this.configManager.getConfig();
            
            if (!config.backupFolderPath || config.backupFolderPath.trim() === '') {
                const action = await this.uiManager.showBackupFolderPrompt();
                
                if (action === 'configure') {
                    await this.configureSettings();
                } else if (action === 'local') {
                    this.uiManager.showSuccessMessage('Las versiones se mantendrán solo en la carpeta local .local-versions');
                }
                return;
            }

            const workspacePath = await this.getWorkspacePath();
            const versionsPath = path.join(workspacePath, config.versionsPath);

            await this.uiManager.showProgress('Sincronizando con la carpeta de respaldo...', async (progress) => {
                progress.report({ increment: 0, message: 'Copiando archivos...' });

                const workspaceName = path.basename(workspacePath);
                await this.fileOps.syncToBackupFolder(versionsPath, config.backupFolderPath, workspaceName);

                progress.report({ increment: 100, message: 'Completado' });
            });

            this.uiManager.showSuccessMessage('Versiones sincronizadas con la carpeta de respaldo exitosamente.');

        } catch (error) {
            this.uiManager.showErrorMessage(`Error sincronizando con la carpeta de respaldo: ${(error as Error).message}`);
        }
    }

    async configureSettings(): Promise<void> {
        try {
            const config = await this.configManager.getConfig();
            
            // Configurar carpeta de respaldo
            const backupFolderPath = await this.uiManager.getBackupFolderPath(config.backupFolderPath);
            if (backupFolderPath === undefined) return; // Usuario canceló

            // Configurar modo de snapshot por defecto
            const snapshotMode = await this.uiManager.getSnapshotMode();
            if (!snapshotMode) return; // Usuario canceló

            let selectedFolders = config.selectedFolders;

            // Si eligió modo selectivo, configurar las carpetas
            if (snapshotMode.value === 'selective') {
                try {
                    const workspacePath = await this.getWorkspacePath();
                    const folders = await this.uiManager.selectFolders(workspacePath, config.excludePatterns, config.selectedFolders);
                    
                    if (folders === null) return; // Usuario canceló
                    
                    selectedFolders = folders || [];

                    if (selectedFolders.length === 0) {
                        const keepMode = await vscode.window.showWarningMessage(
                            'No seleccionaste ninguna carpeta. ¿Quieres mantener el modo selectivo de todas formas?',
                            'Sí, mantener',
                            'No, cambiar a "Preguntar"'
                        );
                        
                        if (keepMode === 'No, cambiar a "Preguntar"') {
                            snapshotMode.value = 'ask';
                        }
                    }

                } catch (error) {
                    this.uiManager.showErrorMessage('Error configurando carpetas. Se usará el modo "Preguntar cada vez".');
                    snapshotMode.value = 'ask';
                    selectedFolders = [];
                }
            }

            // Guardar configuración
            await this.configManager.updateConfig('backupFolderPath', backupFolderPath.trim());
            await this.configManager.updateConfig('defaultSnapshotMode', snapshotMode.value);
            await this.configManager.updateConfig('selectedFolders', selectedFolders);

            // Mostrar resumen
            let configSummary = `Configuración actualizada:\n`;
            configSummary += `• Carpeta de respaldo: ${backupFolderPath.trim() || 'No configurada'}\n`;
            configSummary += `• Modo de snapshot: ${snapshotMode.label}\n`;
            
            if (snapshotMode.value === 'selective' && selectedFolders.length > 0) {
                configSummary += `• Carpetas por defecto: ${selectedFolders.join(', ')}`;
            }

            this.uiManager.showSuccessMessage(configSummary);

        } catch (error) {
            this.uiManager.showErrorMessage(`Error configurando: ${(error as Error).message}`);
        }
    }

    async checkFirstTimeSetup(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const existingConfig = await this.configManager.loadProjectConfiguration(workspacePath);
            
            // Si ya existe configuración, no hacer nada
            if (existingConfig) return;

            const shouldSetup = await this.uiManager.showWelcomeMessage();

            if (shouldSetup === 'setup') {
                await this.runFirstTimeSetup();
            }
        } catch (error) {
            console.log('Error checking first time setup:', error);
        }
    }

    private async createSnapshotProcess(
        workspacePath: string,
        versionsPath: string,
        snapshotMode: string,
        selectedFolders: string[],
        description: string,
        config: any
    ): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const typePrefix = snapshotMode === 'selective' ? 'partial' : 'full';
        const versionId = `v_${typePrefix}_${timestamp}`;
        const snapshotPath = path.join(versionsPath, versionId);

        await this.uiManager.showProgress('Creando snapshot...', async (progress) => {
            progress.report({ increment: 0, message: 'Copiando archivos...' });

            // Crear carpeta para esta versión
            if (!fs.existsSync(snapshotPath)) {
                fs.mkdirSync(snapshotPath, { recursive: true });
            }

            // Copiar archivos según el tipo de snapshot
            if (snapshotMode === 'selective') {
                await this.fileOps.copySelectedFolders(workspacePath, snapshotPath, selectedFolders, config.excludePatterns);
            } else {
                await this.fileOps.copyWorkspaceFiles(workspacePath, snapshotPath, config.excludePatterns);
            }

            progress.report({ increment: 70, message: 'Guardando metadatos...' });

            // Calcular tamaño y guardar información
            const size = await this.versionManager.calculateFolderSize(snapshotPath);

            const versionInfo: VersionInfo = {
                id: versionId,
                timestamp: new Date().toISOString(),
                description: description,
                filePath: snapshotPath,
                size: size,
                type: snapshotMode as 'full' | 'selective',
                selectedFolders: snapshotMode === 'selective' ? selectedFolders : undefined
            };

            await this.versionManager.saveVersionInfo(versionsPath, versionInfo);
            await this.versionManager.cleanOldVersions(versionsPath, config.maxVersions);

            progress.report({ increment: 100, message: 'Completado' });
        });

        const sizeInMB = (await this.versionManager.calculateFolderSize(snapshotPath) / (1024 * 1024)).toFixed(2);
        const typeText = snapshotMode === 'selective' 
            ? `(carpetas: ${selectedFolders.join(', ')})` 
            : '(proyecto completo)';
            
        this.uiManager.showSuccessMessage(`Snapshot creado exitosamente: ${versionId} ${typeText} (${sizeInMB} MB)`);
    }

    private async restoreSpecificVersion(version: VersionInfo): Promise<void> {
        const confirmed = await this.uiManager.confirmRestore(version.id);
        if (!confirmed) return;

        try {
            const workspacePath = await this.getWorkspacePath();
            
            await this.uiManager.showProgress('Restaurando versión...', async (progress) => {
                progress.report({ increment: 0, message: 'Copiando archivos...' });
                await this.fileOps.restoreVersion(version.filePath, workspacePath);
                progress.report({ increment: 100, message: 'Completado' });
            });

            this.uiManager.showSuccessMessage(`Versión ${version.id} restaurada exitosamente.`);

        } catch (error) {
            this.uiManager.showErrorMessage(`Error restaurando versión: ${(error as Error).message}`);
        }
    }

    private async runFirstTimeSetup(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const projectName = path.basename(workspacePath);
            
            this.uiManager.showSuccessMessage(`Configurando Local Versioner para el proyecto: ${projectName}`);

            // 1. Configurar carpeta de respaldo
            const backupFolderPath = await this.uiManager.getBackupFolderPath();
            if (backupFolderPath === undefined) {
                this.uiManager.showWarningMessage('Configuración cancelada. Puedes configurarla más tarde con "Local Versioner: Configurar Local Versioner"');
                return;
            }

            const finalBackupPath = backupFolderPath.trim() || '';

            // 2. Configurar modo de snapshot
            const snapshotMode = await this.uiManager.getSnapshotMode();
            if (!snapshotMode) {
                this.uiManager.showWarningMessage('Configuración cancelada. Puedes configurarla más tarde con "Local Versioner: Configurar Local Versioner"');
                return;
            }

            let selectedFolders: string[] = [];

            // 3. Si eligió modo selectivo, configurar las carpetas
            if (snapshotMode.value === 'selective') {
                const folders = await this.uiManager.selectFolders(workspacePath, ['node_modules', '.git', 'tmp', 'temp']);
                
                if (!folders || folders.length === 0) {
                    const fallbackMode = await vscode.window.showWarningMessage(
                        'No seleccionaste ninguna carpeta. ¿Qué quieres hacer?',
                        'Usar proyecto completo',
                        'Preguntar cada vez',
                        'Cancelar'
                    );
                    
                    if (fallbackMode === 'Usar proyecto completo') {
                        snapshotMode.value = 'full';
                    } else if (fallbackMode === 'Preguntar cada vez') {
                        snapshotMode.value = 'ask';
                    } else {
                        this.uiManager.showWarningMessage('Configuración cancelada.');
                        return;
                    }
                } else {
                    selectedFolders = folders;
                }
            }

            // Crear objeto de configuración
            const config: ProjectConfig = {
                projectName: projectName,
                backupFolderPath: finalBackupPath,
                versionsPath: '.local-versions',
                excludePatterns: ['node_modules', '.git', '*.log', 'tmp', 'temp', '.local-versions'],
                maxVersions: 50,
                defaultSnapshotMode: snapshotMode.value,
                selectedFolders: selectedFolders,
                createdAt: new Date().toISOString(),
                version: '1.0.0'
            };

            const shouldSave = await this.uiManager.showConfigurationSummary(config);

            if (shouldSave === 'save') {
                await this.configManager.saveProjectConfiguration(workspacePath, config);
                await this.configManager.applyProjectConfiguration(config);
                
                const shouldExclude = await this.uiManager.askAboutGitignore();
                if (shouldExclude) {
                    await this.addToGitignore(workspacePath);
                }
                
                this.uiManager.showSuccessMessage(
                    '✅ Configuración guardada exitosamente!\n\nYa puedes empezar a crear snapshots con "Local Versioner: Crear Snapshot"'
                );
            } else {
                this.uiManager.showSuccessMessage(
                    'Configuración no guardada. Puedes configurarla manualmente con "Local Versioner: Configurar Local Versioner"'
                );
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error en la configuración inicial: ${(error as Error).message}`);
        }
    }

    private validateSelectedFolders(workspacePath: string, selectedFolders: string[]): string[] {
        return selectedFolders.filter(folderName => {
            const folderPath = path.join(workspacePath, folderName);
            return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
        });
    }

    private async addToGitignore(workspacePath: string): Promise<void> {
        const gitignorePath = path.join(workspacePath, '.gitignore');
        let gitignoreContent = '';
        
        if (fs.existsSync(gitignorePath)) {
            gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        }
        
        if (!gitignoreContent.includes('.local-versioner-config.json')) {
            gitignoreContent += '\n# Local Versioner configuration\n.local-versioner-config.json\n.local-versions/\n';
            fs.writeFileSync(gitignorePath, gitignoreContent);
        }
    }
}