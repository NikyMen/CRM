# Wolves Indumentaria

Cliente #2 del producto: **Wolves Indumentaria** (@wolves.indumentaria.ok), fabricantes de
indumentaria deportiva, urbana y personalizada. Sauce 835, Barranqueras, Chaco, **Argentina**.

Corre el mismo código de `main` que ROMEZ; sólo cambian la configuración y los assets. Las
cosas de Paraguay, ROMEZ y contabilidad que todavía quedan en el producto son de la fase 2: no
se arreglan en esta instancia.

## Qué hay acá

| Archivo | Para qué |
| --- | --- |
| `brand.env` | Marca y región (`BRAND_*`, `NEXT_PUBLIC_BRAND_*`, `APP_TIMEZONE`, `DEFAULT_CURRENCY`). Sin secretos. |
| `docker-compose.override.yml` | Contenedores, puertos y volúmenes propios, para no tocar los de ROMEZ. |
| `post-bootstrap.cjs` | Ajustes posteriores al bootstrap por la API: embudo, checklists y módulos. |
| `source/instagram-profile-150.jpg` | Foto de perfil original de Instagram (150 px), origen del logo provisorio. |
| `source/wolves-pdf-source.png` | Origen limpio del logo de los PDF: fondo blanco liso, lienzo 1,55:1. |

Assets: `frontend/public/brand/wolves-{light,dark,favicon}.png` y
`backend/assets/wolves-logo{-rgb.zlib,-alpha.zlib,.json}`.

| Servicio | Dónde |
| --- | --- |
| PostgreSQL | `127.0.0.1:55433`, contenedor `wolves_postgres`, volumen `crm_wolves_postgres_data` |
| Redis | `127.0.0.1:56380`, contenedor `wolves_redis`, volumen `crm_wolves_redis_data` |
| Backend | `http://127.0.0.1:3010` (API `/api/v1`, salud `/health`) |
| Frontend | `http://localhost:3011` |

## Levantar desde cero

Requisitos: Node 24, pnpm 10 y Docker. Los comandos son para bash (Git Bash en Windows).

### 1. Código

```bash
git clone https://github.com/NikyMen/CRM.git CRM-Wolves
cd CRM-Wolves
pnpm install
```

### 2. PostgreSQL y Redis aislados

`docker-compose.yml` fija `crm_postgres`, `crm_redis` y los volúmenes `crm_romez_*`. Levantarlo
tal cual comparte o pisa la base local de ROMEZ. El override de Wolves lo evita:

```bash
cp deploy/clients/wolves/docker-compose.override.yml docker-compose.override.yml
printf '/docker-compose.override.yml\n' >> .git/info/exclude
```

La copia de la raíz **no se versiona**: Compose la carga sola y, en `main`, se la aplicaría a
todos los clientes.

`.env` de la raíz (no se versiona). Los secretos van al azar y url-safe, por ejemplo
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`:

```dotenv
POSTGRES_USER=wolves_user
POSTGRES_PASSWORD=<secreto>
POSTGRES_DB=wolves_db
POSTGRES_HOST_PORT=55433
REDIS_HOST_PORT=56380
REDIS_PASSWORD=<secreto>
```

```bash
docker compose -p crm-wolves up -d postgres redis
docker ps --format '{{.Names}}\t{{.Ports}}'
docker volume ls
```

Tienen que aparecer `wolves_postgres`, `wolves_redis` y los volúmenes `crm_wolves_*`, y ningún
`crm_romez_*`. Nunca `docker compose down -v`: borra los volúmenes.

### 3. `backend/.env`

```bash
cp backend/.env.example backend/.env
```

- `DATABASE_URL` y `DIRECT_URL`: `postgresql://wolves_user:<POSTGRES_PASSWORD>@127.0.0.1:55433/wolves_db`
- `REDIS_URL`: `redis://:<REDIS_PASSWORD>@127.0.0.1:56380`
- `JWT_SECRET`: 48 bytes o más al azar (`node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"`)
- `PORT=3010` y `FRONTEND_URL=http://localhost:3011`
- La sección de backend de `brand.env`, con los colores **entre comillas**.
- Comentar las cuatro `META_*`: vacías frenan el arranque con "Variables de entorno inválidas".
- `ROMEZ_OWNER_*` quedan vacías: se pasan sólo al proceso del bootstrap (paso 6).

### 4. `frontend/.env`

```bash
cp frontend/.env.example frontend/.env
```

- `NEXT_PUBLIC_API_URL=http://localhost:3010/api/v1`
- La sección de frontend de `brand.env`, con los colores **entre comillas**.

Sin comillas, dotenv lee `#111111` como un comentario: el color queda vacío y la instancia
vuelve en silencio a los de ROMEZ, tanto en el frontend como en los PDF.

### 5. Migraciones

```bash
pnpm --filter crm exec prisma migrate deploy
```

Nunca `prisma db push`.

### 6. Owner

Las credenciales van en `backend/.data/owner-wolves.txt`, que git ignora (comprobalo con
`git check-ignore -v backend/.data/owner-wolves.txt`):

```text
email=<email del owner>
password=<16 caracteres o más>
```

`prisma/seed.ts` no carga `backend/.env`, así que al proceso se le precarga dotenv. Las
variables `ROMEZ_*` viven sólo en ese comando:

```bash
F=backend/.data/owner-wolves.txt
DOTENV_JS="$(node -p "require.resolve('dotenv/config',{paths:['backend']}).split(String.fromCharCode(92)).join('/')")"
NODE_OPTIONS="-r $DOTENV_JS" DOTENV_CONFIG_PATH="$PWD/backend/.env" DOTENV_CONFIG_QUIET=true \
ROMEZ_OWNER_EMAIL="$(sed -n 's/^email=//p' $F)" \
ROMEZ_OWNER_PASSWORD="$(sed -n 's/^password=//p' $F)" \
ROMEZ_OWNER_FIRST_NAME="Administrador" \
ROMEZ_WORKSPACE_NAME="Wolves Indumentaria" ROMEZ_WORKSPACE_SLUG=wolves \
pnpm --filter crm db:bootstrap
```

Se corre **una sola vez**. Busca el embudo por nombre: si se repite (por ejemplo, para cambiar
la contraseña del owner), crea otro "Gestión Comercial ROMEZ" y lo deja como predeterminado, y
vuelve a escribir `es-PY`, PYG, Asunción y DNIT en `workspace.settings`. Si pasa, correr de
nuevo el paso 7.

### 7. Ajustes después del bootstrap

Con el backend levantado (`pnpm --filter crm dev`):

```bash
node deploy/clients/wolves/post-bootstrap.cjs backend/.data/owner-wolves.txt
```

Usa la API autenticada; no toca SQL ni código. Es idempotente:

- Renombra el embudo a **Pedidos Wolves** y deja las etapas Consulta → Diseño/presupuesto →
  Seña recibida → En producción → Listo para entregar → Entregado (ganada) → No concretado
  (perdida). "Listo para entregar" queda sin probabilidad: la API no permite fijarla.
- Archiva los cuatro checklists contables (DNIT/Marangatu, salarios, cierre anual, alta de
  cliente). La app no los borra: los desactiva.
- Prende Ventas, Stock, Gestión comercial, Tickets, Atención al cliente, Chat interno, Equipo,
  Clientes, Cobranzas y Planilla diaria. Inicio e Integraciones quedan como vienen (prendidos).

Lo que deja el bootstrap en `workspace.settings` (`es-PY`, PYG, `America/Asuncion`, Paraguay,
DNIT, Marangatu) no tiene API: sólo se cambia por SQL. Hoy ningún módulo lo lee.

### 8. Arrancar y compilar

```bash
pnpm --filter crm dev
pnpm --filter frontend exec next dev -p 3011
```

Comprobar `http://127.0.0.1:3010/health` y `http://localhost:3011/login`.

`NEXT_PUBLIC_*` se fija al compilar: después de tocar `frontend/.env`, `pnpm --filter frontend build`.

## Logo provisorio

Sale de la foto de perfil de Instagram, que sólo existe a 150 px: se limpió la textura de la
tela del fondo y se agrandó con bordes suaves, pero de cerca se notan los bordes ondulados.
Reemplazarlo cuando llegue el logo en alta (SVG, o PNG de 1000 px o más con fondo liso).

| Archivo | Qué es | Dónde se ve |
| --- | --- | --- |
| `wolves-light.png` | 512×512, palabra negra sobre mosaico blanco redondeado | Panel oscuro del login, recuperación de acceso |
| `wolves-dark.png` | 512×512, palabra blanca sobre `#0a0a0a` | Sidebar (se funde con el fondo), login en móvil, ícono de Apple |
| `wolves-favicon.png` | 256×256, la "V" de lobo blanca sobre `#111111` | Pestaña del navegador |

Son mosaicos con fondo propio, como los de ROMEZ, porque el login pone `brand.logo` sobre el
panel oscuro y `brand.logoOnDark` sobre fondo claro en móvil: un PNG transparente desaparecería
en uno de los dos.

Logo de los PDF:

```bash
node backend/scripts/build-pdf-logo.cjs deploy/clients/wolves/source/wolves-pdf-source.png wolves-logo
```

- El PDF dibuja el logo con **alto fijo** (76 pt en el encabezado, 330 pt la marca de agua). Un
  logo apaisado sin relleno haría una marca de agua más ancha que la hoja; por eso el origen
  tiene un lienzo de 1,55:1 con la palabra al 96 % del ancho.
- En `main` el script no compila: en la línea 60 el `'\n'` quedó como un salto de línea literal.
  Hasta que se corrija ahí, hay que correr una copia con esa línea arreglada.

## A tener en cuenta

- **Moneda:** Ventas, Cobranzas, Saldos y promesas de pago sólo ofrecen PYG y USD (PYG por
  defecto). `DEFAULT_CURRENCY=ARS` hoy no tiene efecto.
- **Teléfonos:** las líneas de WhatsApp de Cobranzas y Gestión comercial asumen Paraguay (+595).
  Cargar los números en formato internacional (`+54 9 362 …`).
- **Identificación:** los clientes tienen RUC y DV. Un DNI entra en el campo RUC; un CUIT con
  guiones falla en la importación.
- **Favicon:** Next inyecta también `frontend/app/favicon.ico` (la "R" de ROMEZ) antes que el de
  Wolves; según el navegador puede verse el de ROMEZ.
- **Tema oscuro:** no hay selector en la interfaz. Si se fuerza (`localStorage` `crm-theme=dark`),
  el sidebar queda ilegible porque `globals.css` redefine `white` como `#10213d`.
- **WhatsApp:** el QR se escanea en persona desde la app.

## Pendiente

- Logo en alta resolución y regenerar los tres PNG y el logo de los PDF.
- Escanear el QR de WhatsApp.
- Definir dónde se despliega.
