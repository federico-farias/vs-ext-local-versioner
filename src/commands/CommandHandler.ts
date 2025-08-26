import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigurationManager, ProjectConfig, ExtensionConfig, DEFAULT_EXCLUDE_PATTERNS } from '../config/ConfigurationManager';
import { VersionManager, VersionInfo } from '../version/VersionManager';
import { FileOperations } from '../file/FileOperations';
import { UIManager } from '../ui/UIManager';
import { SSHManager, SSHConfig } from '../ssh/SSHManager';

export class CommandHandler {
    private configManager: ConfigurationManager;
    private versionManager: VersionManager;
    private fileOps: FileOperations;
    private uiManager: UIManager;
    private sshManager: SSHManager;

    constructor() {
        this.configManager = new ConfigurationManager();
        this.versionManager = new VersionManager();
        this.fileOps = new FileOperations();
        this.uiManager = new UIManager();
        this.sshManager = new SSHManager();
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
            
            // Combinar configuración de VS Code con configuración del proyecto
            const config = await this.getMergedConfig(workspacePath);
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

    async checkForEmptyProjectSetup(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            
            // Verificar si hay archivo de configuración
            const configExists = await this.configManager.loadProjectConfiguration(workspacePath);
            if (!configExists || !configExists.sshConfig) {
                // No hay configuración SSH, no podemos ofrecer descarga
                return;
            }

            // Verificar si la carpeta está prácticamente vacía
            const isEmpty = await this.isProjectFolderEmpty(workspacePath);
            if (!isEmpty) {
                // La carpeta tiene contenido, no necesitamos hacer nada
                return;
            }

            // Ofrecer descargar la última versión
            await this.offerLatestVersionDownload(configExists);

        } catch (error) {
            console.log('Error checking for empty project setup:', error);
        }
    }

    private async isProjectFolderEmpty(workspacePath: string): Promise<boolean> {
        try {
            const items = fs.readdirSync(workspacePath);
            
            // Archivos/carpetas que no cuentan como "contenido del proyecto"
            const ignoredItems = [
                '.local-versioner-config.json',
                '.local-versions',
                '.vscode',
                '.git',
                'node_modules',
                '.gitignore',
                'README.md',
                'LICENSE',
                '.DS_Store',
                'Thumbs.db'
            ];

            // Filtrar solo archivos/carpetas que indican contenido real del proyecto
            const projectItems = items.filter(item => {
                // Ignorar archivos ocultos del sistema y configuración
                if (item.startsWith('.') && !item.startsWith('.env')) {
                    return false;
                }
                
                // Ignorar elementos específicos
                if (ignoredItems.includes(item)) {
                    return false;
                }

                return true;
            });

            // Si hay 2 o menos elementos reales, consideramos que está vacía
            return projectItems.length <= 2;

        } catch (error) {
            console.log('Error checking if project folder is empty:', error);
            return false;
        }
    }

    private async offerLatestVersionDownload(config: ProjectConfig): Promise<void> {
        const projectName = config.projectName;
        const shouldDownload = await vscode.window.showInformationMessage(
            `🔍 Detección de Proyecto Vacío\n\n` +
            `Se detectó que el proyecto "${projectName}" está prácticamente vacío, pero tienes ` +
            `configuración SSH para conectarte al servidor.\n\n` +
            `¿Te gustaría descargar y restaurar automáticamente la versión más reciente del servidor?`,
            {
                modal: true,
                detail: `Servidor: ${config.sshConfig?.username}@${config.sshConfig?.host}\n` +
                       `Esto descargará la última versión disponible y la restaurará automáticamente.`
            },
            'Sí, descargar última versión',
            'No, continuar con carpeta vacía'
        );

        if (shouldDownload === 'Sí, descargar última versión') {
            await this.downloadAndRestoreLatestVersion();
        }
    }

    private async downloadAndRestoreLatestVersion(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);
            const projectName = path.basename(workspacePath);

            // Cargar configuración SSH
            const sshConfig = await this.configManager.loadSSHConfig(workspacePath);
            if (!sshConfig) {
                this.uiManager.showErrorMessage('No se encontró configuración SSH válida.');
                return;
            }

            this.sshManager.setConfig(sshConfig);

            // Obtener lista de versiones remotas - operación rápida, progreso simple
            const remoteVersions = await this.uiManager.showProgress('🔍 Obteniendo lista de versiones del servidor...', async (progress) => {
                progress.report({ increment: 50, message: 'Consultando servidor...' });
                const versions = await this.sshManager.listRemoteVersions(projectName);
                progress.report({ increment: 100, message: `${versions.length} versiones encontradas` });
                return versions;
            });

            if (remoteVersions.length === 0) {
                this.uiManager.showWarningMessage(
                    `No se encontraron versiones del proyecto "${projectName}" en el servidor.\n\n` +
                    `Puedes comenzar creando tu primer snapshot con "Crear Snapshot".`
                );
                return;
            }

            // Obtener la versión más reciente
            const latestVersion = remoteVersions[0];

            // Descarga con progreso REAL basado en eventos de SftpClient
            const success = await this.uiManager.showProgressWithPercentage(`📦 Descargando ${latestVersion}`, async (progress) => {
                let currentPercentage = 0;
                
                const downloadResult = await this.sshManager.downloadSingleVersionWithProgress(
                    versionsPath, 
                    projectName, 
                    latestVersion,
                    (transferred: number, total: number, filename: string) => {
                        // Calcular progreso real basado en bytes transferidos
                        const realPercentage = Math.round((transferred / total) * 70); // 70% para descarga
                        const increment = realPercentage - currentPercentage;
                        
                        if (increment > 0) {
                            currentPercentage = realPercentage;
                            const sizeTransferred = (transferred / (1024 * 1024)).toFixed(1);
                            const sizeTotal = (total / (1024 * 1024)).toFixed(1);
                            
                            progress.report({ 
                                increment: increment, 
                                message: `⬇️ ${sizeTransferred}MB / ${sizeTotal}MB - ${path.basename(filename)}` 
                            });
                        }
                    }
                );
                
                if (!downloadResult) {
                    progress.report({ increment: 0, message: '❌ Error en la descarga' });
                    return false;
                }

                // Restauración - operación real pero rápida
                progress.report({ increment: 15, message: '🔄 Restaurando archivos en workspace...' });
                
                const versionPath = path.join(versionsPath, latestVersion);
                await this.fileOps.restoreVersion(versionPath, workspacePath);

                progress.report({ increment: 10, message: '📊 Actualizando registro local...' });
                await this.updateLocalVersionsAfterDownload(versionsPath, latestVersion);
                
                progress.report({ increment: 5, message: '✅ Proceso completado' });
                return true;
            });

            // ...existing success handling code...
            if (success) {
                const versionPath = path.join(versionsPath, latestVersion);
                const size = await this.versionManager.calculateFolderSize(versionPath);
                const sizeInMB = (size / (1024 * 1024)).toFixed(2);

                this.uiManager.showSuccessMessage(
                    `✅ ¡Proyecto restaurado exitosamente!\n\n` +
                    `📦 Versión: ${latestVersion}\n` +
                    `📁 Proyecto: ${projectName}\n` +
                    `💾 Tamaño: ${sizeInMB} MB\n` +
                    `🖥️ Servidor: ${sshConfig.host}\n\n` +
                    `El proyecto ahora contiene la última versión disponible.`
                );

                const nextAction = await vscode.window.showInformationMessage(
                    '¿Qué te gustaría hacer ahora?',
                    'Ver todas las versiones disponibles',
                    'Crear nuevo snapshot',
                    'Continuar trabajando'
                );

                if (nextAction === 'Ver todas las versiones disponibles') {
                    await this.showRemoteVersions();
                } else if (nextAction === 'Crear nuevo snapshot') {
                    await this.createSnapshot();
                }
            } else {
                this.uiManager.showErrorMessage('Error descargando o restaurando la versión más reciente del servidor.');
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error en restauración automática: ${(error as Error).message}`);
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
                const folders = await this.uiManager.selectFolders(workspacePath, DEFAULT_EXCLUDE_PATTERNS);
                
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
                excludePatterns: DEFAULT_EXCLUDE_PATTERNS,
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

    async configureSSH(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            
            this.uiManager.showSuccessMessage('🔧 Configurando conexión SSH al servidor...');

            const sshConfig = await this.sshManager.configureSSH();
            if (!sshConfig) {
                this.uiManager.showWarningMessage('Configuración SSH cancelada.');
                return;
            }

            // Probar la conexión
            const testResult = await this.uiManager.showProgress('Probando conexión SSH...', async (progress) => {
                progress.report({ increment: 50, message: 'Conectando al servidor...' });
                const result = await this.sshManager.testConnection(sshConfig);
                progress.report({ increment: 100, message: result ? 'Conexión exitosa' : 'Error de conexión' });
                return result;
            });

            if (!testResult) {
                this.uiManager.showErrorMessage('No se pudo conectar al servidor. Verifica la configuración.');
                return;
            }

            // Guardar configuración SSH
            await this.configManager.saveSSHConfig(workspacePath, sshConfig);
            this.sshManager.setConfig(sshConfig);

            this.uiManager.showSuccessMessage(
                `✅ Conexión SSH configurada exitosamente!\n\n` +
                `Servidor: ${sshConfig.username}@${sshConfig.host}:${sshConfig.port}\n` +
                `Ruta remota: ${sshConfig.remotePath}\n\n` +
                `Ya puedes usar los comandos de backup SSH.`
            );

        } catch (error) {
            this.uiManager.showErrorMessage(`Error configurando SSH: ${(error as Error).message}`);
        }
    }

    async uploadToServer(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);
            const projectName = path.basename(workspacePath);

            // Cargar configuración SSH
            const sshConfig = await this.configManager.loadSSHConfig(workspacePath);
            if (!sshConfig) {
                const shouldConfigure = await vscode.window.showWarningMessage(
                    'No tienes configurada la conexión SSH. ¿Quieres configurarla ahora?',
                    'Sí, configurar SSH',
                    'Cancelar'
                );
                
                if (shouldConfigure === 'Sí, configurar SSH') {
                    await this.configureSSH();
                    return;
                }
                return;
            }

            this.sshManager.setConfig(sshConfig);

            // Verificar que hay versiones para subir
            const versions = await this.versionManager.getVersions(versionsPath);
            if (versions.length === 0) {
                this.uiManager.showWarningMessage('No hay versiones locales para subir al servidor.');
                return;
            }

            const success = await this.uiManager.showProgress('Subiendo versiones al servidor...', async (progress) => {
                progress.report({ increment: 0, message: 'Conectando al servidor...' });
                
                const result = await this.sshManager.uploadVersions(versionsPath, projectName);
                
                progress.report({ increment: 100, message: result ? 'Subida completada' : 'Error en la subida' });
                return result;
            });

            if (success) {
                this.uiManager.showSuccessMessage(
                    `✅ Versiones subidas exitosamente al servidor!\n\n` +
                    `Proyecto: ${projectName}\n` +
                    `Versiones: ${versions.length}\n` +
                    `Servidor: ${sshConfig.host}\n\n` +
                    `Tu equipo ya puede descargar las últimas versiones.`
                );
            } else {
                this.uiManager.showErrorMessage('Error subiendo versiones al servidor.');
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error en subida SSH: ${(error as Error).message}`);
        }
    }

    async downloadFromServer(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);
            const projectName = path.basename(workspacePath);

            // Cargar configuración SSH
            const sshConfig = await this.configManager.loadSSHConfig(workspacePath);
            if (!sshConfig) {
                const shouldConfigure = await vscode.window.showWarningMessage(
                    'No tienes configurada la conexión SSH. ¿Quieres configurarla ahora?',
                    'Sí, configurar SSH',
                    'Cancelar'
                );
                
                if (shouldConfigure === 'Sí, configurar SSH') {
                    await this.configureSSH();
                    return;
                }
                return;
            }

            this.sshManager.setConfig(sshConfig);

            // Preguntar si quiere sobrescribir versiones locales
            const shouldOverwrite = await vscode.window.showWarningMessage(
                'Esta operación descargará las versiones del servidor y puede sobrescribir tus versiones locales.\n\n¿Quieres continuar?',
                'Sí, descargar',
                'Cancelar'
            );

            if (shouldOverwrite !== 'Sí, descargar') {
                return;
            }

            const success = await this.uiManager.showProgress('Descargando versiones del servidor...', async (progress) => {
                progress.report({ increment: 0, message: 'Conectando al servidor...' });
                
                const result = await this.sshManager.downloadVersions(versionsPath, projectName);
                
                progress.report({ increment: 100, message: result ? 'Descarga completada' : 'Error en la descarga' });
                return result;
            });

            if (success) {
                const localVersions = await this.versionManager.getVersions(versionsPath);
                this.uiManager.showSuccessMessage(
                    `✅ Versiones descargadas exitosamente del servidor!\n\n` +
                    `Proyecto: ${projectName}\n` +
                    `Versiones disponibles: ${localVersions.length}\n` +
                    `Servidor: ${sshConfig.host}\n\n` +
                    `Puedes usar "Ver Versiones" para explorar las versiones descargadas.`
                );
            } else {
                this.uiManager.showErrorMessage('No se encontraron versiones del proyecto en el servidor o hubo un error en la descarga.');
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error en descarga SSH: ${(error as Error).message}`);
        }
    }

    async showRemoteVersions(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const projectName = path.basename(workspacePath);

            // Cargar configuración SSH
            const sshConfig = await this.configManager.loadSSHConfig(workspacePath);
            if (!sshConfig) {
                this.uiManager.showWarningMessage('No tienes configurada la conexión SSH. Usa "Configurar SSH" primero.');
                return;
            }

            this.sshManager.setConfig(sshConfig);

            const remoteVersions = await this.uiManager.showProgress('Listando versiones remotas...', async (progress) => {
                progress.report({ increment: 50, message: 'Conectando al servidor...' });
                
                const versions = await this.sshManager.listRemoteVersions(projectName);
                
                progress.report({ increment: 100, message: `${versions.length} versiones encontradas` });
                return versions;
            });

            if (remoteVersions.length === 0) {
                this.uiManager.showSuccessMessage(`No se encontraron versiones del proyecto "${projectName}" en el servidor.`);
                return;
            }

            const items = remoteVersions.map(versionName => ({
                label: `📦 ${versionName}`,
                description: 'Versión en servidor',
                detail: `Servidor: ${sshConfig.host}`,
                version: versionName
            }));

            const selectedItem = await vscode.window.showQuickPick(items, {
                placeHolder: `Versiones de "${projectName}" en el servidor (${remoteVersions.length} versiones)`
            });

            if (selectedItem) {
                const action = await vscode.window.showInformationMessage(
                    `Versión seleccionada: ${selectedItem.version}\n` +
                    `Proyecto: ${projectName}\n` +
                    `Servidor: ${sshConfig.username}@${sshConfig.host}:${sshConfig.remotePath}/${projectName}/\n\n` +
                    `¿Qué quieres hacer?`,
                    'Descargar solo esta versión',
                    'Descargar todas las versiones',
                    'Cerrar'
                );

                if (action === 'Descargar solo esta versión') {
                    await this.downloadSingleVersionFromServer(selectedItem.version);
                } else if (action === 'Descargar todas las versiones') {
                    await this.downloadFromServer();
                }
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error listando versiones remotas: ${(error as Error).message}`);
        }
    }

    async downloadSingleVersionFromServer(versionName: string): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);
            const projectName = path.basename(workspacePath);

            // Cargar configuración SSH
            const sshConfig = await this.configManager.loadSSHConfig(workspacePath);
            if (!sshConfig) {
                this.uiManager.showErrorMessage('No tienes configurada la conexión SSH.');
                return;
            }

            this.sshManager.setConfig(sshConfig);

            // Verificar si la versión ya existe localmente
            const localVersionPath = path.join(versionsPath, versionName);
            if (fs.existsSync(localVersionPath)) {
                const shouldOverwrite = await vscode.window.showWarningMessage(
                    `La versión ${versionName} ya existe localmente. ¿Quieres sobrescribirla?`,
                    'Sí, sobrescribir',
                    'Cancelar'
                );
                
                if (shouldOverwrite !== 'Sí, sobrescribir') {
                    return;
                }
            }

            const success = await this.uiManager.showProgress(`Descargando versión ${versionName}...`, async (progress) => {
                progress.report({ increment: 0, message: 'Conectando al servidor...' });
                
                const result = await this.sshManager.downloadSingleVersion(versionsPath, projectName, versionName);
                
                progress.report({ increment: 100, message: result ? 'Descarga completada' : 'Error en la descarga' });
                return result;
            });

            if (success) {
                // Actualizar el archivo de versiones locales para incluir la nueva versión descargada
                await this.updateLocalVersionsAfterDownload(versionsPath, versionName);
                
                this.uiManager.showSuccessMessage(
                    `✅ Versión ${versionName} descargada exitosamente!\n\n` +
                    `Proyecto: ${projectName}\n` +
                    `Servidor: ${sshConfig.host}\n\n` +
                    `Puedes usar "Ver Versiones" para explorar la versión descargada o restaurarla.`
                );
            } else {
                this.uiManager.showErrorMessage(`Error descargando la versión ${versionName} del servidor.`);
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error descargando versión: ${(error as Error).message}`);
        }
    }

    private async updateLocalVersionsAfterDownload(versionsPath: string, versionName: string): Promise<void> {
        try {
            const versionPath = path.join(versionsPath, versionName);
            
            // Calcular tamaño de la versión descargada
            const size = await this.versionManager.calculateFolderSize(versionPath);
            
            // Crear información de versión basada en el nombre
            const versionInfo: VersionInfo = {
                id: versionName,
                timestamp: new Date().toISOString(), // Usamos timestamp actual para la descarga
                description: `Versión descargada del servidor: ${versionName}`,
                filePath: versionPath,
                size: size,
                type: versionName.includes('_partial_') ? 'selective' : 'full',
                selectedFolders: versionName.includes('_partial_') ? ['(carpetas del servidor)'] : undefined
            };

            // Agregar a las versiones locales
            await this.versionManager.saveVersionInfo(versionsPath, versionInfo);
            
        } catch (error) {
            // Error no crítico, la descarga fue exitosa pero no se pudo actualizar el registro local
            console.log('Error updating local version info after download:', error);
        }
    }

    // Nuevo método para combinar configuraciones
    private async getMergedConfig(workspacePath: string): Promise<ExtensionConfig> {
        // Obtener configuración base de VS Code
        const baseConfig = await this.configManager.getConfig();
        
        // Intentar cargar configuración del proyecto
        const projectConfig = await this.configManager.loadProjectConfiguration(workspacePath);
        
        // Si existe configuración del proyecto, usar sus valores
        if (projectConfig) {
            return {
                backupFolderPath: projectConfig.backupFolderPath || baseConfig.backupFolderPath,
                versionsPath: projectConfig.versionsPath || baseConfig.versionsPath,
                excludePatterns: projectConfig.excludePatterns || baseConfig.excludePatterns,
                maxVersions: projectConfig.maxVersions || baseConfig.maxVersions,
                defaultSnapshotMode: projectConfig.defaultSnapshotMode || baseConfig.defaultSnapshotMode,
                selectedFolders: projectConfig.selectedFolders || baseConfig.selectedFolders
            };
        }
        
        // Si no hay configuración del proyecto, usar solo la de VS Code
        return baseConfig;
    }

    async downloadAndRestoreLatest(): Promise<void> {
        try {
            const workspacePath = await this.getWorkspacePath();
            const config = await this.configManager.getConfig();
            const versionsPath = path.join(workspacePath, config.versionsPath);
            const projectName = path.basename(workspacePath);

            // Cargar configuración SSH
            const sshConfig = await this.configManager.loadSSHConfig(workspacePath);
            if (!sshConfig) {
                const shouldConfigure = await vscode.window.showWarningMessage(
                    'No tienes configurada la conexión SSH. ¿Quieres configurarla ahora?',
                    'Sí, configurar SSH',
                    'Cancelar'
                );
                
                if (shouldConfigure === 'Sí, configurar SSH') {
                    await this.configureSSH();
                    return;
                }
                return;
            }

            this.sshManager.setConfig(sshConfig);

            // Confirmar la acción con advertencia
            const confirmed = await vscode.window.showWarningMessage(
                `🚨 Descargar y Restaurar Última Versión\n\n` +
                `Esta acción descargará la versión más reciente del servidor y ` +
                `SOBRESCRIBIRÁ todos los archivos actuales en tu workspace.\n\n` +
                `Proyecto: ${projectName}\n` +
                `Servidor: ${sshConfig.username}@${sshConfig.host}\n\n` +
                `⚠️ Se perderán los cambios no guardados. ¿Continuar?`,
                {
                    modal: true,
                    detail: 'Esta operación no se puede deshacer. Considera crear un snapshot antes de continuar.'
                },
                'Sí, descargar y restaurar',
                'Crear snapshot primero'
            );

            if (confirmed === 'Crear snapshot primero') {
                await this.createSnapshot();
                return;
            } else if (confirmed !== 'Sí, descargar y restaurar') {
                return;
            }

            // Obtener lista de versiones remotas
            const remoteVersions = await this.uiManager.showProgress('🔍 Obteniendo versiones del servidor...', async (progress) => {
                progress.report({ increment: 50, message: 'Consultando servidor...' });
                const versions = await this.sshManager.listRemoteVersions(projectName);
                progress.report({ increment: 100, message: `${versions.length} versiones encontradas` });
                return versions;
            });

            if (remoteVersions.length === 0) {
                this.uiManager.showWarningMessage(
                    `No se encontraron versiones del proyecto "${projectName}" en el servidor.\n\n` +
                    `Asegúrate de que el proyecto tenga versiones subidas al servidor.`
                );
                return;
            }

            // Obtener la versión más reciente (primera en la lista)
            const latestVersion = remoteVersions[0];

            // Mostrar información de la versión a descargar
            const proceedWithLatest = await vscode.window.showInformationMessage(
                `📦 Última versión encontrada: ${latestVersion}\n\n` +
                `Se descargará y restaurará automáticamente en tu workspace.\n` +
                `¿Proceder con la descarga?`,
                'Sí, descargar',
                'Ver todas las versiones',
                'Cancelar'
            );

            if (proceedWithLatest === 'Ver todas las versiones') {
                await this.showRemoteVersions();
                return;
            } else if (proceedWithLatest !== 'Sí, descargar') {
                return;
            }

            // Descarga y restauración con progreso detallado
            const success = await this.uiManager.showProgressWithPercentage(`📦 Descargando y restaurando ${latestVersion}`, async (progress) => {
                let currentPercentage = 0;
                
                // Fase 1: Descarga (70% del progreso)
                const downloadResult = await this.sshManager.downloadSingleVersionWithProgress(
                    versionsPath, 
                    projectName, 
                    latestVersion,
                    (transferred: number, total: number, filename: string) => {
                        const realPercentage = Math.round((transferred / total) * 70);
                        const increment = realPercentage - currentPercentage;
                        
                        if (increment > 0) {
                            currentPercentage = realPercentage;
                            const sizeTransferred = (transferred / (1024 * 1024)).toFixed(1);
                            const sizeTotal = (total / (1024 * 1024)).toFixed(1);
                            
                            progress.report({ 
                                increment: increment, 
                                message: `⬇️ Descargando: ${sizeTransferred}MB / ${sizeTotal}MB` 
                            });
                        }
                    }
                );
                
                if (!downloadResult) {
                    progress.report({ increment: 0, message: '❌ Error en la descarga' });
                    return false;
                }

                // Fase 2: Restauración (25% del progreso)
                progress.report({ increment: 15, message: '🔄 Restaurando archivos en workspace...' });
                
                const versionPath = path.join(versionsPath, latestVersion);
                await this.fileOps.restoreVersion(versionPath, workspacePath);

                // Fase 3: Actualización de registro (5% del progreso)
                progress.report({ increment: 10, message: '📊 Actualizando registro local...' });
                await this.updateLocalVersionsAfterDownload(versionsPath, latestVersion);
                
                progress.report({ increment: 5, message: '✅ Proceso completado' });
                return true;
            });

            if (success) {
                const versionPath = path.join(versionsPath, latestVersion);
                const size = await this.versionManager.calculateFolderSize(versionPath);
                const sizeInMB = (size / (1024 * 1024)).toFixed(2);

                this.uiManager.showSuccessMessage(
                    `✅ ¡Última versión restaurada exitosamente!\n\n` +
                    `📦 Versión: ${latestVersion}\n` +
                    `📁 Proyecto: ${projectName}\n` +
                    `💾 Tamaño: ${sizeInMB} MB\n` +
                    `🖥️ Servidor: ${sshConfig.host}\n\n` +
                    `Tu workspace ahora contiene la última versión del servidor.`
                );

                // Ofrecer acciones siguientes
                const nextAction = await vscode.window.showInformationMessage(
                    '¿Qué te gustaría hacer ahora?',
                    'Ver historial completo',
                    'Crear nuevo snapshot',
                    'Subir cambios al servidor',
                    'Continuar trabajando'
                );

                if (nextAction === 'Ver historial completo') {
                    await this.showRemoteVersions();
                } else if (nextAction === 'Crear nuevo snapshot') {
                    await this.createSnapshot();
                } else if (nextAction === 'Subir cambios al servidor') {
                    await this.uploadToServer();
                }
            } else {
                this.uiManager.showErrorMessage('Error descargando o restaurando la última versión del servidor.');
            }

        } catch (error) {
            this.uiManager.showErrorMessage(`Error en descarga de última versión: ${(error as Error).message}`);
        }
    }
}