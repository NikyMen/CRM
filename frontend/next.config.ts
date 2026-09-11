import type { NextConfig } from 'next'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const distDir = process.env.NEXT_DIST_DIR?.trim()
const projectRoot = dirname(fileURLToPath(import.meta.url))
const workspaceRoot = join(projectRoot, '..')
const legacyChannelsEnabled = process.env.ENABLE_LEGACY_CHANNELS?.trim().toLowerCase() === 'true'

const nextConfig: NextConfig = {
  turbopack: {
    root: workspaceRoot,
  },
  ...(distDir ? { distDir } : {}),
  ...(!legacyChannelsEnabled ? {
    async redirects() {
      return [
        { source: '/inbox', destination: '/tickets', permanent: false },
        { source: '/api-meta', destination: '/settings?tab=whatsapp', permanent: false },
        { source: '/messenger-instagram', destination: '/settings?tab=whatsapp', permanent: false },
        { source: '/channels', destination: '/settings?tab=whatsapp', permanent: false },
      ]
    },
  } : {}),
}

export default nextConfig
