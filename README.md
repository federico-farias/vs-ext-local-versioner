# Local Versioner

![VS Code Extension](https://img.shields.io/badge/VS%20Code-Extension-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-MIT-blue)

**Local Versioner** es una extensión de Visual Studio Code que permite crear snapshots locales de tu código con sincronización manual a carpetas de respaldo como Google Drive, OneDrive, etc.

## 🚀 Características

- **📸 Snapshots Locales**: Crea versiones comprimidas de tu código con timestamps automáticos
- **📋 Historial de Versiones**: Visualiza y navega entre todas las versiones guardadas
- **🔄 Restauración Fácil**: Restaura cualquier versión anterior con un solo clic
- **☁️ Sincronización Manual**: Copia automáticamente a tu carpeta de respaldo (Google Drive, OneDrive, etc.)
- **⚙️ Configuración Flexible**: Patrones de exclusión, límite de versiones, rutas personalizadas
- **🎯 Modos de Snapshot**: Completo, selectivo o preguntar cada vez

## 📦 Instalación

1. Abre Visual Studio Code
2. Ve a la pestaña de Extensiones (`Ctrl+Shift+X`)
3. Busca "Local Versioner"
4. Haz clic en "Instalar"

O instala desde el archivo `.vsix`:
```bash
code --install-extension local-versioner-1.0.0.vsix
```

## 🎯 Uso

### Comandos Principales

- **`Ctrl+Shift+P`** → `Local Versioner: Crear Snapshot`
- **`Ctrl+Shift+P`** → `Local Versioner: Ver Historial de Versiones`
- **`Ctrl+Shift+P`** → `Local Versioner: Copiar a Carpeta de Respaldo`
- **`Ctrl+Shift+P`** → `Local Versioner: Configurar Local Versioner`

### Menú Contextual

También puedes acceder a las funciones principales haciendo clic derecho en cualquier carpeta del explorador:

- **Crear Snapshot** - Crea una nueva versión de la carpeta seleccionada
- **Copiar a Carpeta de Respaldo** - Sincroniza con tu carpeta de respaldo

### Configuración Inicial

1. Ejecuta el comando `Local Versioner: Configurar Local Versioner`
2. Configura la ruta de tu carpeta de respaldo (Google Drive, OneDrive, etc.)
3. Personaliza los patrones de exclusión si es necesario
4. ¡Listo para usar!

## ⚙️ Configuración

### Configuraciones Disponibles

```json
{
  "localVersioner.backupFolderPath": "",
  "localVersioner.versionsPath": ".local-versions",
  "localVersioner.excludePatterns": [
    "node_modules",
    ".git",
    "*.log",
    "tmp",
    "temp"
  ],
  "localVersioner.maxVersions": 50,
  "localVersioner.defaultSnapshotMode": "ask",
  "localVersioner.selectedFolders": []
}
```

### Descripción de Configuraciones

| Configuración | Descripción | Valor por Defecto |
|---------------|-------------|-------------------|
| `backupFolderPath` | Ruta a tu carpeta de respaldo externa | `""` (vacío) |
| `versionsPath` | Carpeta local donde se guardan las versiones | `.local-versions` |
| `excludePatterns` | Patrones de archivos/carpetas a excluir | `["node_modules", ".git", "*.log", "tmp", "temp"]` |
| `maxVersions` | Número máximo de versiones a mantener | `50` |
| `defaultSnapshotMode` | Modo por defecto para crear snapshots | `ask` |
| `selectedFolders` | Carpetas por defecto para snapshots selectivos | `[]` |

## 🔧 Casos de Uso

### Para Desarrolladores

- **Prototipos Rápidos**: Guarda versiones antes de experimentar con el código
- **Backup Automático**: Sincroniza automáticamente con servicios en la nube
- **Historial Local**: Mantén un historial local sin depender de Git remoto

### Para Equipos Sin Git Centralizado

- **Versionado Simple**: Ideal para equipos que no pueden usar Git centralizado
- **Compartir Versiones**: Sincroniza con carpetas compartidas del equipo
- **Control de Cambios**: Rastrea cambios importantes con descripciones

### Para Proyectos Específicos

- **Scripts de Base de Datos**: Perfecto para procedimientos almacenados
- **Scripts de Sistema**: Ideal para scripts Bash, PowerShell, etc.
- **Configuraciones**: Versiona archivos de configuración importantes

## 📁 Estructura de Archivos

```
tu-proyecto/
├── .local-versions/
│   ├── versions.json          # Metadatos de versiones
│   ├── snapshot_20250822_143022.zip
│   ├── snapshot_20250822_150315.zip
│   └── ...
└── tu-codigo/
    ├── archivos...
    └── carpetas...
```

### Formato de Metadatos (versions.json)

```json
{
  "versions": [
    {
      "id": "snapshot_20250822_143022",
      "timestamp": "2025-08-22T14:30:22.123Z",
      "description": "Implementación de nueva funcionalidad",
      "size": 1024576,
      "files": 45,
      "mode": "full"
    }
  ]
}
```

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Por favor lee nuestra [Guía de Contribución](CONTRIBUTING.md).

### Desarrollo Local

```bash
# Clonar el repositorio
git clone https://github.com/your-username/local-versioner.git
cd local-versioner

# Instalar dependencias
npm install

# Compilar
npm run compile

# Ejecutar tests
npm test

# Empaquetar extensión
npm run package
```

## 🐛 Reportar Issues

Si encuentras algún problema:

1. Verifica que no exista un issue similar
2. Crea un nuevo issue con:
   - Descripción detallada del problema
   - Pasos para reproducir
   - Versión de VS Code y del sistema operativo
   - Capturas de pantalla si es relevante

## 📋 Roadmap

- [ ] Interfaz gráfica mejorada para el historial
- [ ] Comparación visual entre versiones
- [ ] Soporte para Git integrado
- [ ] Sincronización automática en intervalos
- [ ] Compresión configurable
- [ ] Etiquetas personalizadas para versiones

## 📄 Licencia

Este proyecto está licenciado bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 🙏 Agradecimientos

- Comunidad de VS Code por la excelente API de extensiones
- Contribuidores y usuarios que reportan issues y sugerencias

## 📞 Soporte

- **Issues**: [GitHub Issues](https://github.com/your-username/local-versioner/issues)
- **Documentación**: [Wiki del Proyecto](https://github.com/your-username/local-versioner/wiki)
- **Email**: federico.farias@outlook.com

---

**¿Te gusta la extensión?** ⭐ ¡Dale una estrella en GitHub y compártela con otros desarrolladores!