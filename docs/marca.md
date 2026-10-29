# Marca por instancia

Cada cliente corre el mismo código con su propio `.env`. La marca visible se configura con
variables; si quedan vacías, la instancia se presenta como **Gestión ROMEZ** (cliente #1), así
que ROMEZ no necesita cambios.

Los identificadores técnicos (`crm`, rutas, `components/romez`, claves de `localStorage`) no
cambian: no son visibles para el usuario.

## Backend (`backend/.env`, se lee al arrancar)

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `BRAND_NAME` | Log de arranque, PDF, mensajes de error, prueba de webhooks | `Gestión ROMEZ` |
| `BRAND_SHORT_NAME` | Grupo del chat interno ("Equipo …") | `ROMEZ` |
| `BRAND_TAGLINE` | Encabezado y pie de los PDF ("… · Servicios contables") | `Servicios contables` |
| `BRAND_SLUG` | Nombre de los CSV descargados (`cobranzas-<slug>-…`) | `romez` |
| `BRAND_PDF_LOGO` | Nombre del logo en `backend/assets/` | `romez-logo` |
| `BRAND_PDF_PRIMARY_COLOR` | Títulos y filetes de los PDF, `#rrggbb` | azul marino ROMEZ |
| `BRAND_PDF_ACCENT_COLOR` | Acento de los PDF, `#rrggbb` | azul ROMEZ |

Un valor inválido (slug con mayúsculas, color que no es `#rrggbb`) frena el arranque con
`Variables BRAND_* inválidas`.

### Logo de los PDF

Los PDF incrustan el logo ya procesado, sin fondo. Para un cliente nuevo:

```bash
node backend/scripts/build-pdf-logo.cjs ruta/al/logo.png cliente-logo
```

El tercer argumento opcional recorta el original (`izq,arriba,ancho,alto` en píxeles). El fondo
del original tiene que ser un color uniforme: el script lo vuelve transparente. Genera
`cliente-logo-rgb.zlib`, `cliente-logo-alpha.zlib` y `cliente-logo.json` en `backend/assets/`;
después se configura `BRAND_PDF_LOGO=cliente-logo`. Si falta alguno de los tres archivos, el PDF
sale sin logo y queda un aviso en el log.

## Frontend (`frontend/.env`, se fija en `next build`)

Next reemplaza `NEXT_PUBLIC_*` al compilar: cambiar la marca exige recompilar, igual que
`NEXT_PUBLIC_API_URL`.

| Variable | Uso | Valor por defecto |
| --- | --- | --- |
| `NEXT_PUBLIC_BRAND_NAME` | Título de la pestaña, login, sidebar, textos | `Gestión ROMEZ` |
| `NEXT_PUBLIC_BRAND_SHORT_NAME` | "Equipo …", "Cobranzas …", "WhatsApp de …" | `ROMEZ` |
| `NEXT_PUBLIC_BRAND_LEGAL_NAME` | Texto alternativo de los logos | `ROMEZ Servicios Contables` |
| `NEXT_PUBLIC_BRAND_DESCRIPTION` | Meta descripción | se arma con la razón social |
| `NEXT_PUBLIC_BRAND_SLUG` | Nombre de los CSV descargados desde el navegador | `romez` |
| `NEXT_PUBLIC_BRAND_LOGO` | Logo sobre fondo claro | `/brand/romez-light.jpg` |
| `NEXT_PUBLIC_BRAND_LOGO_ON_DARK` | Logo sobre fondo oscuro, ícono de Apple | `/brand/romez-navy.jpg` |
| `NEXT_PUBLIC_BRAND_FAVICON` | Favicon | `/favicon.ico` |

Los logos son rutas dentro de `frontend/public/` (por ejemplo `/brand/cliente-light.png`). Una
ruta externa o inválida se ignora y se usa la de ROMEZ.

### Colores

Pisan las variables `--brand-*` de `app/globals.css`. Sólo se aceptan hex (`#rrggbb` o
`#rrggbbaa`); un valor inválido se ignora.

| Variable | Variable CSS | Tema |
| --- | --- | --- |
| `NEXT_PUBLIC_BRAND_COLOR_NAVY` | `--brand-navy` (botones primarios, burbujas propias) | ambos |
| `NEXT_PUBLIC_BRAND_COLOR_NAVY_DEEP` | `--brand-navy-deep` (sidebar) | ambos |
| `NEXT_PUBLIC_BRAND_COLOR_BLUE` | `--brand-blue` (acento, foco, etiquetas) | claro |
| `NEXT_PUBLIC_BRAND_COLOR_BLUE_HOVER` | `--brand-blue-hover` | claro |
| `NEXT_PUBLIC_BRAND_COLOR_PAPER` | `--brand-paper` (fondos de acento) | claro |
| `NEXT_PUBLIC_BRAND_COLOR_BLUE_DARK` | `--brand-blue` | oscuro |
| `NEXT_PUBLIC_BRAND_COLOR_BLUE_HOVER_DARK` | `--brand-blue-hover` | oscuro |
| `NEXT_PUBLIC_BRAND_COLOR_PAPER_DARK` | `--brand-paper` | oscuro |

Quedan fijos en azul ROMEZ: la escala `--primary-50…900`, el anillo de foco de `.ctrl-input` y
la trama del fondo del chat. Si un cliente usa una paleta muy distinta, conviene pasarlos a
variables derivadas de `--brand-*`.

## Fuera de esta fase

- Bootstrap: `ROMEZ_OWNER_*`, el nombre por defecto del workspace, el embudo "Gestión Comercial
  ROMEZ" y los checklists DNIT/Marangatu siguen fijos (fase 2).
- Páginas legales y datos de contacto por cliente (fase 5, al traer el módulo de Meta).
- Ops: usuario `romez`, nombres de PM2, Nginx/Traefik y backups (fase 4).
