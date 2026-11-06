# Alqan Launcher

Launcher de Minecraft **minimalista, de código abierto y multiplataforma** (Windows, macOS y Linux), con una interfaz inspirada en Prism Launcher.

## Características

- **Instancias** estilo Prism: cuadrícula, panel lateral de acciones, doble clic para iniciar.
- **Versiones desde 1.12** (releases y snapshots opcionales).
- **Cuentas**: Offline (no premium), **Microsoft** (premium) y **Ely.by** (no premium con skins).
- **Modloaders**: Vanilla, Fabric y Quilt.
- **Explorar Modrinth**: **modpacks** (.mrpack, como Fabulously Optimized), mods, resource packs y shaders. Un modpack crea una instancia lista para jugar.
- **Apariencia personalizable**: temas, colores (fondo, paneles, texto, acento), imagen de fondo con oscurecido y desenfoque, redondeo.
- **Almacenamiento**: lista lo que ocupa espacio (versiones, instancias, Java, bibliotecas y assets) y permite borrarlo para liberar espacio.
- **Skins**: biblioteca con vista 3D; se aplican a cuentas no premium mediante un paquete de recursos automático.
- **Paquetes de recursos**: crea, importa (.zip), edita texturas, cambia icono/descripción, activa y exporta a .zip. Formato correcto para cada versión (incluida 26.x).
- **Personalización**: tamaño de texto, tipografía, grosor y color de los iconos (SVG minimalistas), además de colores y fondo.
- **Java automático** (Adoptium Temurin) para cada versión, español e inglés.

## Actualizaciones

En Ajustes → General escribe el repositorio de GitHub (`usuario/repositorio`) donde publicas las versiones. Alqan avisa al abrir si hay una más nueva y el botón **Actualizar ahora** descarga el instalador, comprueba su SHA-256 (si la versión incluye `SHA256SUMS.txt`) y lo ejecuta. Publica en cada versión el `Setup.exe` y `dist/SHA256SUMS.txt`.

## Instalador

El instalador de Windows (`Alqan-Launcher-Setup-x.y.z.exe`) usa el tema de Alqan: imágenes propias, textos en español, acceso directo en escritorio y menú inicio, y al desinstalar pregunta si quieres borrar tus datos (por defecto se conservan).

## Chrome o Windows dicen que es un virus

Es un falso positivo: el instalador no está firmado digitalmente y es un archivo nuevo y poco descargado, así que Chrome (Navegación segura) y SmartScreen lo marcan. No se arregla del todo sin un certificado de firma de código. Mientras tanto:

- **Chrome:** en Descargas pulsa el menú ⋮ del archivo → **Conservar** (o "Descargar de todas formas"). **Windows:** "Más información" → "Ejecutar de todos modos".
- Al compilar, `dist/SHA256SUMS.txt` guarda las huellas para que otros verifiquen el archivo.
- Para eliminar el aviso: firma el .exe (SignPath ofrece firma gratuita a proyectos de código abierto) y reporta el falso positivo en <https://safebrowsing.google.com/safebrowsing/report_error/>. Publicar en GitHub Releases también ayuda a ganar reputación.

## Compilar

**Windows (.exe)**: ejecuta `build-windows.bat` (o `npm install` y `npm run dist:win`). Genera un instalador y una versión portable en `dist/`.

```bash
npm install
npm start            # desarrollo
npm run dist:win     # .exe
npm run dist:mac     # .dmg
npm run dist:linux   # AppImage
```

Si subes el proyecto a GitHub y creas una etiqueta (`git tag v2.1.0 && git push --tags`), `.github/workflows/build.yml` compila las tres plataformas.

## Cuenta de Microsoft

Microsoft exige que cada aplicación que inicia sesión con cuentas de Minecraft tenga su propio **Client ID** aprobado por Mojang. Alqan no incluye uno, así que necesitas el tuyo:

1. En [portal.azure.com](https://portal.azure.com) crea un registro de aplicación (cuentas personales de Microsoft) y activa "Permitir flujos de cliente público".
2. Solicita la aprobación en <https://aka.ms/mce-reviewappid>.
3. Pega el Client ID en la pestaña Cuentas del launcher.

## Notas

- **TLauncher** no ofrece inicio de sesión para otros launchers, por eso no se puede vincular. Usa una cuenta offline o Ely.by.
- Forge, NeoForge y CurseForge no están soportados todavía (los modpacks de Forge/NeoForge se rechazan con un aviso).
- Los ejecutables no están firmados: Windows SmartScreen o macOS pueden mostrar un aviso la primera vez.
- No afiliado a Mojang ni a Microsoft. Minecraft es marca de Mojang AB.

Licencia MIT. Mira [CONTRIBUTING.md](CONTRIBUTING.md).

## Servidor de cuentas propio (Alqan Auth)

La carpeta `server/` incluye un servidor de cuentas y skins sin dependencias, compatible con authlib-injector (el mismo sistema de Ely.by). Es opcional y lo alojas tú.

```bash
cd server
PUBLIC_URL=https://auth.midominio.com PORT=8080 node server.js
```

- Variables: `PUBLIC_URL` (dirección pública con https), `PORT`, `DATA_DIR`, `REGISTRATION=closed` (cierra el registro), `SERVER_NAME`, `TRUST_PROXY=1` (si va detrás de nginx/Caddy).
- En el launcher: Cuentas → "Sistema de cuentas propio", escribe la dirección, un usuario y una contraseña (mín. 8) y pulsa **Crear cuenta**. Después puedes subir una skin PNG de 64x64.
- Las contraseñas se guardan con scrypt, los tokens caducan a los 30 días y hay límite de intentos por IP.
- **Alcance:** estas cuentas funcionan en servidores de Minecraft configurados para usar tu servidor de cuentas (con authlib-injector) y en servidores sin verificación (offline). **No** sirven en servidores premium normales ni en Realms: solo Mojang/Microsoft puede validar esas cuentas.
- Usa https en producción (por ejemplo con Caddy o nginx delante), porque las contraseñas viajan al servidor.

## Publicar en GitHub

```bash
git init && git add . && git commit -m "feat: Alqan Launcher"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/alqan-launcher.git
git push -u origin main
git tag v2.8.0 && git push --tags     # compila y publica el instalador en Releases
```
