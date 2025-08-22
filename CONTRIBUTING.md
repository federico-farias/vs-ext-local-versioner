# Guía de Contribución

¡Gracias por tu interés en contribuir a Local Versioner! Valoramos todas las contribuciones, desde reportes de bugs hasta nuevas características.

## 📋 Tabla de Contenidos

- [Código de Conducta](#código-de-conducta)
- [¿Cómo puedo contribuir?](#cómo-puedo-contribuir)
- [Configuración del Entorno de Desarrollo](#configuración-del-entorno-de-desarrollo)
- [Proceso de Desarrollo](#proceso-de-desarrollo)
- [Estilo de Código](#estilo-de-código)
- [Proceso de Pull Request](#proceso-de-pull-request)
- [Reportar Bugs](#reportar-bugs)
- [Sugerir Mejoras](#sugerir-mejoras)

## Código de Conducta

Este proyecto adhiere al código de conducta de código abierto. Al participar, esperamos que mantengas este código.

## ¿Cómo puedo contribuir?

### 🐛 Reportar Bugs

Los bugs se rastrean como [GitHub Issues](https://github.com/your-username/local-versioner/issues). Cuando reportes un bug:

- **Usa un título claro y descriptivo**
- **Describe los pasos exactos para reproducir el problema**
- **Describe el comportamiento que observaste después de seguir los pasos**
- **Explica qué comportamiento esperabas ver en su lugar y por qué**
- **Incluye capturas de pantalla si es relevante**
- **Proporciona información del entorno** (VS Code version, SO, etc.)

### 💡 Sugerir Mejoras

Las mejoras también se rastrean como [GitHub Issues](https://github.com/your-username/local-versioner/issues). Cuando sugieras una mejora:

- **Usa un título claro y descriptivo**
- **Proporciona una descripción paso a paso de la mejora sugerida**
- **Explica por qué esta mejora sería útil**
- **Incluye ejemplos específicos para demostrar los pasos**

### 🔧 Contribuir con Código

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Haz tus cambios
4. Añade tests si es necesario
5. Ejecuta los tests existentes
6. Commit tus cambios (`git commit -am 'Añade nueva funcionalidad'`)
7. Push a la rama (`git push origin feature/nueva-funcionalidad`)
8. Crea un Pull Request

## Configuración del Entorno de Desarrollo

### Prerrequisitos

- [Node.js](https://nodejs.org/) (versión 16 o superior)
- [Visual Studio Code](https://code.visualstudio.com/)
- [Git](https://git-scm.com/)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/your-username/local-versioner.git
cd local-versioner

# Instalar dependencias
npm install

# Compilar el proyecto
npm run compile
```

### Ejecutar la Extensión en Modo Desarrollo

1. Abre el proyecto en VS Code
2. Presiona `F5` para ejecutar la extensión en una nueva ventana de VS Code
3. En la nueva ventana, abre cualquier proyecto y prueba los comandos de Local Versioner

### Scripts Disponibles

```bash
# Compilar TypeScript
npm run compile

# Compilar en modo watch (recompila automáticamente)
npm run watch

# Ejecutar tests
npm test

# Ejecutar linter
npm run lint

# Corregir problemas de linting automáticamente
npm run lint:fix

# Empaquetar la extensión
npm run package

# Limpiar archivos compilados
npm run clean
```

## Proceso de Desarrollo

### Estructura del Proyecto

```
src/
├── extension.ts          # Punto de entrada principal
├── commands/            # Comandos de la extensión
├── utils/              # Utilidades y helpers
├── types/              # Definiciones de tipos TypeScript
└── test/               # Tests unitarios
```

### Añadir un Nuevo Comando

1. Crea un nuevo archivo en `src/commands/`
2. Implementa la funcionalidad del comando
3. Registra el comando en `src/extension.ts`
4. Añade el comando al `package.json` en la sección `contributes.commands`
5. Añade tests para el nuevo comando

### Ejemplo de Comando

```typescript
// src/commands/miComando.ts
import * as vscode from 'vscode';

export async function miComando() {
    try {
        // Implementación del comando
        vscode.window.showInformationMessage('¡Mi comando ejecutado!');
    } catch (error) {
        vscode.window.showErrorMessage(`Error: ${error}`);
    }
}
```

```typescript
// src/extension.ts
import { miComando } from './commands/miComando';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('localVersioner.miComando', miComando);
    context.subscriptions.push(disposable);
}
```

## Estilo de Código

### TypeScript

- Usa TypeScript estricto
- Prefiere `const` sobre `let` cuando sea posible
- Usa interfaces para definir tipos de objetos
- Documenta funciones públicas con JSDoc
- Usa nombres descriptivos para variables y funciones

### Ejemplo de Estilo

```typescript
/**
 * Crea un snapshot del workspace actual
 * @param description Descripción del snapshot
 * @param mode Modo de creación del snapshot
 * @returns Promise que resuelve con el ID del snapshot creado
 */
export async function createSnapshot(
    description: string, 
    mode: SnapshotMode = 'full'
): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('No hay workspace abierto');
    }

    // Implementación...
    return snapshotId;
}
```

### ESLint

El proyecto usa ESLint para mantener consistencia en el código:

```bash
# Verificar código
npm run lint

# Corregir automáticamente
npm run lint:fix
```

## Proceso de Pull Request

### Antes de Crear el PR

1. **Ejecuta todos los tests**: `npm test`
2. **Ejecuta el linter**: `npm run lint`
3. **Compila el proyecto**: `npm run compile`
4. **Prueba manualmente** la funcionalidad
5. **Actualiza la documentación** si es necesario

### Creando el PR

1. **Título claro**: Describe qué hace el cambio
2. **Descripción detallada**: Explica el problema que resuelve
3. **Lista de cambios**: Enumera los cambios principales
4. **Tests**: Describe cómo testear los cambios
5. **Breaking changes**: Menciona si hay cambios que rompen compatibilidad

### Template de PR

```markdown
## Descripción
Breve descripción de los cambios realizados.

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva funcionalidad
- [ ] Breaking change
- [ ] Mejora de documentación

## ¿Cómo se puede testear?
Descripción de cómo testear los cambios.

## Checklist
- [ ] Mi código sigue el estilo del proyecto
- [ ] He realizado una auto-revisión de mi código
- [ ] He comentado mi código en áreas difíciles de entender
- [ ] He realizado cambios correspondientes a la documentación
- [ ] Mis cambios no generan nuevos warnings
- [ ] He añadido tests que prueban que mi fix es efectivo o que mi feature funciona
- [ ] Tests nuevos y existentes pasan localmente
```

## Testing

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Tests en modo watch
npm run test:watch

# Coverage
npm run test:coverage
```

### Escribir Tests

Los tests van en la carpeta `src/test/`. Usa Mocha y Chai:

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import { createSnapshot } from '../commands/createSnapshot';

suite('Create Snapshot Tests', () => {
    test('Should create snapshot successfully', async () => {
        const snapshotId = await createSnapshot('Test snapshot');
        assert.ok(snapshotId);
        assert.ok(snapshotId.startsWith('snapshot_'));
    });
});
```

## Versionado

Usamos [Semantic Versioning](https://semver.org/):

- **MAJOR**: Cambios incompatibles en la API
- **MINOR**: Nuevas funcionalidades compatibles hacia atrás
- **PATCH**: Bug fixes compatibles hacia atrás

## Reconocimientos

Todos los contribuidores serán reconocidos en el archivo [CONTRIBUTORS.md](CONTRIBUTORS.md).

## ¿Preguntas?

Si tienes preguntas sobre cómo contribuir:

- Abre un [GitHub Issue](https://github.com/your-username/local-versioner/issues)
- Contacta a los mantenedores

¡Gracias por contribuir a Local Versioner! 🎉