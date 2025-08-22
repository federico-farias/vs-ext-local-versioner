# Changelog

All notable changes to the "Local Versioner" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2025-08-22

### Added
- ✨ **Initial release** of Local Versioner extension
- ✨ **Automatic guided setup** on first use
- ✨ **Flexible snapshot modes**: Full project, selective folders, or ask each time
- ✨ **Local versioning system** with `.local-versions` folder
- ✨ **Manual backup sync** to external folders (Google Drive, OneDrive, Dropbox)
- ✨ **Visual version history** with detailed metadata
- ✨ **One-click version restoration** from any snapshot
- ✨ **Smart file exclusion** (node_modules, .git, logs, etc.)
- ✨ **Project configuration** persistence with `.local-versioner-config.json`
- ✨ **Multi-language support** (Spanish UI with English documentation)

### Commands
- `Local Versioner: Crear Snapshot` - Create new code snapshot
- `Local Versioner: Ver Historial de Versiones` - Browse version history
- `Local Versioner: Copiar a Carpeta de Respaldo` - Sync to backup folder
- `Local Versioner: Configurar Local Versioner` - Configure extension settings

### Configuration Options
- `localVersioner.backupFolderPath` - External backup folder path
- `localVersioner.versionsPath` - Local versions folder (default: `.local-versions`)
- `localVersioner.excludePatterns` - File/folder exclusion patterns
- `localVersioner.maxVersions` - Maximum versions to keep (default: 50)
- `localVersioner.defaultSnapshotMode` - Default snapshot mode (ask/full/selective)
- `localVersioner.selectedFolders` - Predefined folders for selective snapshots

### Features
- 📦 **Full project snapshots** with intelligent exclusions
- 📁 **Selective folder snapshots** for targeted versioning
- 🔄 **Automatic cleanup** of old versions when limit exceeded
- 📊 **Size tracking** and metadata for each snapshot
- 🎯 **Context menu integration** in VS Code Explorer
- ⚙️ **Workspace-specific configuration** support

### Technical
- Built with TypeScript 4.9+
- Compatible with VS Code 1.74.0+
- Uses native Node.js APIs (fs, path, zlib)
- No external runtime dependencies
- Supports Windows, macOS, and Linux

---

## Release Notes Template

### [X.Y.Z] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes in existing functionality

#### Deprecated
- Soon-to-be removed features

#### Removed
- Now removed features

#### Fixed
- Bug fixes

#### Security
- Vulnerability fixes