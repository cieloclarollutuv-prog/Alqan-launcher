!macro customWelcomePage
  !ifndef MUI_WELCOMEPAGE_TITLE
    !define MUI_WELCOMEPAGE_TITLE "Bienvenido a Alqan Launcher"
  !endif
  !ifndef MUI_WELCOMEPAGE_TEXT
    !define MUI_WELCOMEPAGE_TEXT "Alqan es un launcher de Minecraft minimalista, moderno y de código abierto.$\r$\n$\r$\n•  Instancias con mods y modpacks de Modrinth$\r$\n•  Cuentas no premium, skins con vista 3D$\r$\n•  Java automático y más FPS$\r$\n•  Paquetes de recursos y temas a tu gusto$\r$\n$\r$\nPulsa Siguiente para elegir dónde instalarlo."
  !endif
  !ifndef MUI_FINISHPAGE_TITLE
    !define MUI_FINISHPAGE_TITLE "¡Alqan está listo!"
  !endif
  !ifndef MUI_FINISHPAGE_TEXT
    !define MUI_FINISHPAGE_TEXT "Alqan Launcher se instaló correctamente.$\r$\n$\r$\nCrea tu primera instancia, elige una skin y a jugar."
  !endif
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  BrandingText "Alqan Launcher · código abierto (MIT)"
!macroend

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Quieres borrar también tus datos de Alqan (instancias, mundos, mods, cuentas y ajustes)?$\r$\n$\r$\nSi eliges No se conservan y podrás reutilizarlos si vuelves a instalar Alqan." /SD IDNO IDNO alqanKeepData
    RMDir /r "$APPDATA\.alqan"
    RMDir /r "$APPDATA\alqan-launcher"
  alqanKeepData:
!macroend

!macro customInstall
  IfFileExists "$PROGRAMFILES64\nodejs\node.exe" alqanNodeDone
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "¿Quieres instalar también Node.js?$\r$\n$\r$\nAlqan no lo necesita para jugar. Solo sirve para ejecutar tu propio servidor de cuentas (carpeta server).$\r$\n$\r$\nSe instalará con winget (necesita internet)." /SD IDNO IDNO alqanNodeDone
    ExecWait '"$SYSDIR\cmd.exe" /c winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements' $0
    IntCmp $0 0 alqanNodeDone
    ExecShell "open" "https://nodejs.org/es/download"
  alqanNodeDone:
!macroend
