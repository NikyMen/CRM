import type { NextConfig } from 'next'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = process.env.NEXT_DIST_DIR?.trim()
const projectRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = join(projectRoot, '..')

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
  ...(distDir ? { distDir } : {}),
  // Redirigir la raíz desde el servidor: el redirect() de app/(dashboard)/page.tsx
  // dentro del layout cliente rompía el render (React #310) o quedaba colgado.
  async redirects() {
    return [{ source: '/', destination: '/dashboard', permanent: false }]
  },
}

export default nextConfig
