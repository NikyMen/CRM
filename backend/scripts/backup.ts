import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'

const execAsync = promisify(exec)

async function backup() {
  const date      = new Date().toISOString().split('T')[0]
  const filename  = `backup-${date}.sql`
  const outputDir = path.join(__dirname, '../backups')

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = path.join(outputDir, filename)
  const dbUrl      = process.env.DATABASE_URL

  if (!dbUrl) {
    console.error('DATABASE_URL no está definida')
    process.exit(1)
  }

  console.log(`Iniciando backup: ${filename}`)

  try {
    await execAsync(`pg_dump "${dbUrl}" -f "${outputPath}" --no-owner --no-acl`)
    const stats = fs.statSync(outputPath)
    console.log(`✅ Backup completado: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`)
  } catch (error) {
    console.error('❌ Error en backup:', error)
    process.exit(1)
  }
}

backup()