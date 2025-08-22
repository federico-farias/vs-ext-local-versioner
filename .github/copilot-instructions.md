<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Local Versioner VS Code Extension

This is a VS Code extension project. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references.

## Project Context

Esta es una extensión de VS Code para versionado local de código con sincronización manual a Google Drive, diseñada específicamente para organizaciones sin permisos de Google Cloud Console.

### Funcionalidades principales:

1. **Versionado Local**: Crear snapshots comprimidos del código con timestamps
2. **Historial de Versiones**: Listar y navegar entre versiones guardadas
3. **Restauración**: Restaurar cualquier versión anterior
4. **Sincronización Manual**: Copiar versiones a carpeta local de Google Drive
5. **Configuración Flexible**: Patrones de exclusión, límite de versiones, etc.

### Comandos implementados:

- `localVersioner.createSnapshot` - Crear nuevo snapshot con descripción
- `localVersioner.listVersions` - Ver historial de versiones
- `localVersioner.restoreVersion` - Restaurar versión específica
- `localVersioner.syncToGoogleDrive` - Sincronizar con Google Drive
- `localVersioner.configureSettings` - Configurar rutas y opciones

### Estructura de datos:

- Versiones se guardan como archivos ZIP en `.local-versions/`
- Metadatos en `versions.json` con timestamps, descripciones y tamaños
- Sincronización copia toda la carpeta a Google Drive automáticamente

### Caso de uso:

Específicamente diseñado para el proyecto `plan_en_pausa` con procedimientos almacenados de Informix y jobs en Bash, permitiendo versionado sin Git centralizado.