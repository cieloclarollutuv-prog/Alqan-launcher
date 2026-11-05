# Alqan Launcher - crea el instalador (.exe) mostrando una barra de progreso.
# Uso: doble clic en build-windows.bat  (este archivo lo ejecuta automaticamente)
# Todo el texto tecnico se guarda en build-log.txt

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$log = Join-Path $PSScriptRoot 'build-log.txt'
Set-Content -LiteralPath $log -Value '' -Encoding ASCII
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$start = Get-Date
$spin = '|', '/', '-', '\'
$script:tick = 0
$script:last = 0.0
$script:exit = 0
$full = [string][char]0x2588
$empty = [string][char]0x2591
$barW = 40

Clear-Host
Write-Host ''
Write-Host '  +----------------------------------------------+' -ForegroundColor Magenta
Write-Host '  |                                              |' -ForegroundColor Magenta
Write-Host '  |      A L Q A N     L A U N C H E R           |' -ForegroundColor Cyan
Write-Host '  |      Creando el instalador de Windows        |' -ForegroundColor Gray
Write-Host '  |                                              |' -ForegroundColor Magenta
Write-Host '  +----------------------------------------------+' -ForegroundColor Magenta
Write-Host ''
Write-Host '  La primera vez tarda unos minutos (descarga Electron y herramientas).' -ForegroundColor DarkGray
Write-Host '  El porcentaje es una estimacion.' -ForegroundColor DarkGray
Write-Host ''
Write-Host ''
Write-Host ''
Write-Host ''
$top = [Console]::CursorTop - 3
try { [Console]::CursorVisible = $false } catch { }

function Pad([string]$s) {
    $w = [Math]::Max(40, [Console]::WindowWidth - 1)
    if ($s.Length -gt $w) { return $s.Substring(0, $w) }
    return $s.PadRight($w)
}

function Draw([double]$pct, [string]$step, [string]$detail) {
    if ($pct -lt $script:last) { $pct = $script:last }   # nunca retrocede
    $script:last = $pct
    $script:tick++
    $s = $spin[$script:tick % 4]
    $filled = [int][Math]::Floor($barW * $pct / 100)
    $bar = ($full * $filled) + ($empty * ($barW - $filled))
    $el = [int]((Get-Date) - $start).TotalSeconds
    $mm = [int][Math]::Floor($el / 60)
    $ss = $el % 60
    [Console]::SetCursorPosition(0, $top)
    [Console]::WriteLine((Pad ('  {0} {1,3}%' -f $bar, [int]$pct)))
    [Console]::WriteLine((Pad ('  {0} {1}   (tiempo {2:00}:{3:00})' -f $s, $step, $mm, $ss)))
    [Console]::WriteLine((Pad ('  ' + $detail)))
}

function Show-Cursor { try { [Console]::CursorVisible = $true } catch { } }

function Fail([string]$msg) {
    [Console]::SetCursorPosition(0, $top + 3)
    Show-Cursor
    Write-Host ''
    Write-Host ('  ERROR: ' + $msg) -ForegroundColor Red
    $txt = ''
    try { $txt = Get-Content -LiteralPath $log -Raw -ErrorAction Stop } catch { }
    if ($txt -match 'symbolic link|required privilege') {
        Write-Host '  Windows no dejo crear enlaces: activa el "Modo de desarrollador" (Configuracion > Para programadores)' -ForegroundColor Yellow
        Write-Host '  o ejecuta build-windows.bat como administrador.' -ForegroundColor Yellow
    } elseif ($txt -match 'ENOTFOUND|ETIMEDOUT|ECONNRESET|getaddrinfo|EAI_AGAIN') {
        Write-Host '  Parece un problema de internet. Revisa tu conexion y vuelve a intentarlo.' -ForegroundColor Yellow
    }
    Write-Host ''
    Write-Host '  Ultimas lineas del registro:' -ForegroundColor DarkGray
    try { Get-Content -LiteralPath $log -Tail 20 | ForEach-Object { Write-Host ('  ' + $_) -ForegroundColor DarkGray } } catch { }
    Write-Host ''
    Write-Host ('  Registro completo: ' + $log) -ForegroundColor DarkGray
    exit 1
}

# Ejecuta un comando oculto, escribe su salida en el registro y anima la barra entre $from y $to.
# $tau = segundos tipicos del paso; $milestones = textos del registro que indican avance real.
function Run-Step([string]$name, [string]$cmd, [double]$from, [double]$to, [double]$tau, $milestones) {
    $p = Start-Process -FilePath $env:ComSpec -ArgumentList ('/c ' + $cmd + ' >> "' + $log + '" 2>&1') -WindowStyle Hidden -PassThru
    $null = $p.Handle   # necesario para poder leer ExitCode despues
    $t0 = Get-Date
    while (-not $p.HasExited) {
        $t = ((Get-Date) - $t0).TotalSeconds
        $frac = [Math]::Min(1 - [Math]::Exp(-$t / $tau), 0.95)
        $txt = ''
        try { $txt = Get-Content -LiteralPath $log -Raw -ErrorAction Stop } catch { }
        foreach ($m in $milestones) {
            if ($txt -match $m[0]) { $frac = [Math]::Max($frac, [double]$m[1]) }
        }
        $detail = ''
        if ($txt) {
            $lines = @($txt -split "`r?`n" | Where-Object { $_.Trim() -ne '' })
            if ($lines.Count -gt 0) { $detail = $lines[$lines.Count - 1].Trim() }
        }
        Draw ($from + ($to - $from) * $frac) $name $detail
        Start-Sleep -Milliseconds 250
    }
    $p.WaitForExit()
    $script:exit = $p.ExitCode
    Draw $to $name ''
}

Draw 0 'Comprobando Node.js...' ''
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Fail 'No se encontro Node.js. Instalalo desde https://nodejs.org y vuelve a ejecutar este archivo.'
}
Draw 3 'Node.js encontrado' ''

Run-Step '[1/2] Instalando dependencias' 'npm install --no-audit --no-fund' 3 40 45 @()
if ($script:exit -ne 0) { Fail 'Fallo la instalacion de dependencias (npm install).' }

$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
$milestones = @(
    @('loaded configuration', 0.06),
    @('packaging', 0.20),
    @('downloaded|updating asar', 0.45),
    @('building\s+target=nsis', 0.62),
    @('building\s+target=portable', 0.88),
    @('building block map', 0.95)
)
Run-Step '[2/2] Creando el .exe' 'npm run dist:win' 40 100 90 $milestones
if ($script:exit -ne 0) { Fail 'Fallo la creacion del .exe (electron-builder).' }

Draw 100 'Listo' ''
[Console]::SetCursorPosition(0, $top + 3)
Show-Cursor
Write-Host ''
Write-Host '  Listo. Archivos creados en la carpeta dist:' -ForegroundColor Green
$dist = Join-Path $PSScriptRoot 'dist'
Get-ChildItem -LiteralPath $dist -Filter '*.exe' | ForEach-Object {
    Write-Host ('   - {0}  ({1:N0} MB)' -f $_.Name, ($_.Length / 1MB))
}
try {
    $sums = Get-ChildItem -LiteralPath $dist -Filter '*.exe' | ForEach-Object { (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLower() + '  ' + $_.Name }
    Set-Content -LiteralPath (Join-Path $dist 'SHA256SUMS.txt') -Value $sums -Encoding ASCII
    Write-Host '  Huellas SHA-256 guardadas en dist\SHA256SUMS.txt' -ForegroundColor DarkGray
} catch { }
Write-Host ''
Write-Host ('  Registro tecnico: ' + $log) -ForegroundColor DarkGray
Start-Process explorer.exe -ArgumentList ('"' + $dist + '"')
exit 0
