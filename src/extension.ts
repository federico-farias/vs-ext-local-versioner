import * as vscode from 'vscode';
import { CommandHandler } from './commands/CommandHandler';
import { VersionManager } from './version/VersionManager';
import { ConfigurationManager } from './config/ConfigurationManager';

let commandHandler: CommandHandler;
let versionManager: VersionManager;
let configManager: ConfigurationManager;

export function activate(context: vscode.ExtensionContext) {
    console.log('Local Versioner extension is now active!');

    // Inicializar los manejadores
    commandHandler = new CommandHandler();
    versionManager = new VersionManager();
    configManager = new ConfigurationManager();

    // Registrar todos los comandos
    const commands = [
        vscode.commands.registerCommand('localVersioner.createSnapshot', () => commandHandler.createSnapshot()),
        vscode.commands.registerCommand('localVersioner.listVersions', () => commandHandler.listVersions()),
        vscode.commands.registerCommand('localVersioner.syncToBackupFolder', () => commandHandler.syncToBackupFolder()),
        vscode.commands.registerCommand('localVersioner.configureSettings', () => commandHandler.configureSettings()),
        // Nuevos comandos SSH
        vscode.commands.registerCommand('localVersioner.configureSSH', () => commandHandler.configureSSH()),
        vscode.commands.registerCommand('localVersioner.uploadToServer', () => commandHandler.uploadToServer()),
        vscode.commands.registerCommand('localVersioner.downloadFromServer', () => commandHandler.downloadFromServer()),
        vscode.commands.registerCommand('localVersioner.showRemoteVersions', () => commandHandler.showRemoteVersions()),
        vscode.commands.registerCommand('localVersioner.downloadAndRestoreLatest', () => commandHandler.downloadAndRestoreLatest())
    ];

    commands.forEach(command => context.subscriptions.push(command));
    
    // Inicializar carpeta de versiones y verificar configuración inicial
    initializeExtension();
}

async function initializeExtension() {
    try {
        await initializeVersionsFolder();
        await commandHandler.checkFirstTimeSetup();
        // Nueva funcionalidad: verificar si la carpeta está vacía y ofrecer descarga automática
        await commandHandler.checkForEmptyProjectSetup();
    } catch (error) {
        console.log('Error during extension initialization:', error);
    }
}

async function initializeVersionsFolder() {
    try {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const config = await configManager.getConfig();
        
        versionManager.initializeVersionsFolder(workspacePath, config.versionsPath);
    } catch (error) {
        console.log('Could not initialize versions folder:', error);
    }
}

export function deactivate() {
    console.log('Local Versioner extension is now deactivated.');
}