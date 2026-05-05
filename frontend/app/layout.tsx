import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ThemeScript } from './theme-script'

export const metadata: Metadata = {
  title: 'CRM',
  description: 'Tu CRM personal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
