const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')

module.exports = {
  apps: [
    {
      name: 'crm-backend',
      cwd: path.join(root, 'backend'),
      script: 'dist/src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1200M',
      kill_timeout: 15_000,
      listen_timeout: 15_000,
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        HOST: '127.0.0.1',
      },
    },
    {
      name: 'crm-frontend',
      cwd: path.join(root, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3002 -H 127.0.0.1',
      interpreter: '/usr/bin/node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '800M',
      kill_timeout: 10_000,
      listen_timeout: 15_000,
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
      },
    },
  ],
}
