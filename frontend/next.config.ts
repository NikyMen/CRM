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
}

export default nextConfig
