# Aceptación backend

El verificador no crea ni modifica datos en su modo predeterminado. Valida:

- `GET /health`;
- rechazo de login inválido;
- login y sesión autenticada;
- 15 clientes concurrentes consultando `/auth/me`;
- 15 conexiones SSE simultáneas a WhatsApp.

Usá credenciales locales de prueba. No las guardes en Git, archivos Markdown ni
argumentos de la terminal.

## Ejecución segura

PowerShell:

```powershell
$env:BASE_URL = 'http://127.0.0.1:3000'
$env:ACCEPTANCE_EMAIL = '<usuario de prueba>'
$env:ACCEPTANCE_PASSWORD = '<contraseña local>'
pnpm acceptance
Remove-Item Env:ACCEPTANCE_EMAIL, Env:ACCEPTANCE_PASSWORD
```

`BASE_URL` puede ser el origen (`https://romez.example`) o terminar en
`/api/v1`. `ACCEPTANCE_SESSION_COUNT` permite cambiar 15 por un valor entre 1
y 50. El script hace un solo login para respetar el límite estricto y reutiliza
ese token en los clientes concurrentes.

## Carrera de toma de ticket

Este modo **asigna el ticket al ganador y no lo libera automáticamente**. Usá
un ticket activo, libre y preparado específicamente para la prueba, junto con
dos miembros del mismo espacio:

```powershell
$env:ACCEPTANCE_MODE = 'claim-race'
$env:ACCEPTANCE_ALLOW_MUTATION = 'claim-ticket'
$env:ACCEPTANCE_TICKET_ID = '<ticket libre>'
$env:ACCEPTANCE_RACER_A_USER_ID = '<id usuario A>'
$env:ACCEPTANCE_RACER_A_EMAIL = '<email A>'
$env:ACCEPTANCE_RACER_A_PASSWORD = '<contraseña A>'
$env:ACCEPTANCE_RACER_B_USER_ID = '<id usuario B>'
$env:ACCEPTANCE_RACER_B_EMAIL = '<email B>'
$env:ACCEPTANCE_RACER_B_PASSWORD = '<contraseña B>'
pnpm acceptance
```

Antes de mutar, el script confirma que ambos usuarios son diferentes, que
pertenecen al mismo espacio, que sus IDs coinciden con las credenciales y que
el ticket está activo y libre. La aceptación exige exactamente un ganador; la
otra solicitud debe quedar rechazada.

Limpiá las variables al terminar. El verificador nunca imprime contraseñas,
tokens, emails, IDs ni cuerpos de respuesta.
