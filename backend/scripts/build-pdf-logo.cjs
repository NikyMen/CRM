/**
 * Genera el logo de la marca que usan los PDF (sin fondo, con canal alfa).
 * Salida: backend/assets/<nombre>-rgb.zlib, <nombre>-alpha.zlib y <nombre>.json (tamaño),
 * listos para incrustarse como imagen /FlateDecode con /SMask. El backend elige <nombre>
 * con BRAND_PDF_LOGO. Se ejecuta a mano sólo si cambia el logo:
 *   node backend/scripts/build-pdf-logo.cjs [origen] [nombre] [recorte izq,arriba,ancho,alto]
 * Sin argumentos regenera el logo de ROMEZ. El fondo del origen debe ser un color uniforme.
 * Usa `sharp`, que ya está instalado como dependencia transitiva de baileys.
 */
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const repo = path.resolve(__dirname, '..', '..')
const sharpDir = fs.readdirSync(path.join(repo, 'node_modules', '.pnpm')).find((name) => name.startsWith('sharp@'))
if (!sharpDir) throw new Error('No encontré sharp en node_modules/.pnpm')
const sharp = require(path.join(repo, 'node_modules', '.pnpm', sharpDir, 'node_modules', 'sharp'))

const [sourceArg, nameArg, cropArg] = process.argv.slice(2)
const source = sourceArg ? path.resolve(sourceArg) : path.join(repo, 'frontend', 'public', 'brand', 'romez-light.jpg')
const name = nameArg || 'romez-logo'
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error('El nombre del logo debe ser un slug: minúsculas, números y guiones')
const crop = cropArg
  ? cropArg.split(',').map(Number)
  : sourceArg ? null : [352, 222, 376, 640]
if (crop && (crop.length !== 4 || crop.some((value) => !Number.isInteger(value) || value < 0))) throw new Error('El recorte va como izq,arriba,ancho,alto en píxeles enteros')
const outDir = path.join(repo, 'backend', 'assets')
const WIDTH = 480

async function main() {
  let image = sharp(source)
  if (crop) image = image.extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] })
  const { data, info } = await image
    .resize({ width: WIDTH })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Fondo gris uniforme del arte original: se convierte en transparencia ("color to alpha").
  const background = [data[0], data[1], data[2]]
  const pixels = info.width * info.height
  const rgb = Buffer.alloc(pixels * 3)
  const alpha = Buffer.alloc(pixels)
  for (let i = 0; i < pixels; i += 1) {
    // Las zonas sólidas quedan opacas; sólo el antialias de los bordes es parcial.
    let diff = 0
    for (let c = 0; c < 3; c += 1) diff = Math.max(diff, Math.abs(data[i * 3 + c] - background[c]))
    let a = diff <= 8 ? 0 : Math.min(1, (diff - 8) / 80)
    alpha[i] = Math.round(a * 255)
    for (let c = 0; c < 3; c += 1) {
      const base = background[c]
      const value = a > 0 ? (data[i * 3 + c] - base * (1 - a)) / a : 255
      rgb[i * 3 + c] = Math.max(0, Math.min(255, Math.round(value)))
    }
  }

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, `${name}-rgb.zlib`), zlib.deflateSync(rgb, { level: 9 }))
  fs.writeFileSync(path.join(outDir, `${name}-alpha.zlib`), zlib.deflateSync(alpha, { level: 9 }))
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({ width: info.width, height: info.height }, null, 2) + '
')
  console.log(`logo ${name} ${info.width}x${info.height} background=${background.join(',')}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
