# Contribuir a Alqan Launcher

¡Gracias por querer ayudar! El proyecto es MIT y cualquier mejora es bienvenida.

## Estructura

```
main.js            Ventana de Electron y canales IPC
preload.js         Puente seguro entre la interfaz y el sistema
src/store.js       Ajustes, instancias y cuentas (JSON en la carpeta de usuario)
src/mojang.js      Lista de versiones y versión de Java requerida
src/java.js        Descarga automática de Java (Adoptium Temurin)
src/loaders.js     Fabric y Quilt
src/modrinth.js    Búsqueda e instalación de mods, resource packs y shaders
src/game.js        Lanzamiento del juego (minecraft-launcher-core)
renderer/          Interfaz (HTML, CSS y JavaScript sin frameworks)
renderer/i18n.js   Traducciones (añade un idioma copiando el bloque `es`)
```

## Desarrollo

```bash
npm install
npm start
```

## Ideas pendientes

- Soporte de Forge y NeoForge
- Modpacks (.mrpack)
- Integración con CurseForge (requiere API key)
- Skins para cuentas offline (por ejemplo vía Ely.by)
- Actualizaciones automáticas del launcher
