# Levanta el entorno LOCAL de pruebas (wppia + n8n). Nada de esto toca producción.
# Uso:  powershell -ExecutionPolicy Bypass -File docs\asistente-comercial\local\iniciar-local.ps1
param(
  [string]$Wppia = 'D:\dev\wppia',
  [string]$N8n   = 'D:\dev\n8n-local'
)
$ErrorActionPreference = 'Stop'
$env:WPPIA_DIR = $Wppia
$env:N8N_DIR   = $N8n

# 1) sesión de wppia + importación en n8n (idempotente). Debe ir ANTES de arrancar wppia.
node (Join-Path $PSScriptRoot 'preparar-local.mjs')

# 2) wppia: panel en http://127.0.0.1:3720 (solo loopback)
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$Wppia'; `$env:LOG_QR_TERMINAL='0'; npm start"

# 3) n8n: http://127.0.0.1:5678 (solo loopback)
$n8nCmd = "cd '$N8n'; `$env:N8N_USER_FOLDER='$N8n\data'; `$env:N8N_HOST='127.0.0.1'; `$env:N8N_PORT='5678'; " +
          "`$env:N8N_SECURE_COOKIE='false'; `$env:N8N_DIAGNOSTICS_ENABLED='false'; `$env:N8N_VERSION_NOTIFICATIONS_ENABLED='false'; " +
          "node node_modules/n8n/bin/n8n start"
Start-Process powershell -ArgumentList '-NoExit', '-Command', $n8nCmd

Write-Host "`nwppia -> http://127.0.0.1:3720   n8n -> http://127.0.0.1:5678"
