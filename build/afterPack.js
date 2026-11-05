// Pone el icono y los datos de la app dentro del .exe.
// Hace falta porque "signAndEditExecutable" esta en false (evita descargar winCodeSign, que pide permisos
// de administrador para crear enlaces). Si algo falla, el build continua con el icono por defecto.
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32' || process.platform !== 'win32') return;
  try {
    const mod = await import('rcedit');
    const rcedit = mod.default || mod.rcedit || mod;
    const info = context.packager.appInfo;
    await rcedit(path.join(context.appOutDir, `${info.productFilename}.exe`), {
      icon: path.join(context.packager.projectDir, 'build', 'icon.ico'),
      'version-string': {
        ProductName: info.productName,
        FileDescription: info.productName,
        CompanyName: 'Alqan Launcher',
        LegalCopyright: 'MIT License'
      },
      'file-version': info.version,
      'product-version': info.version
    });
    console.log('  • icono aplicado al .exe');
  } catch (e) {
    console.warn('  • no se pudo aplicar el icono al .exe: ' + e.message);
  }
};
