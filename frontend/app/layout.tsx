import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ThemeScript } from './theme-script'
import { Inter, Poppins } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-poppins' })

export const metadata: Metadata = {
  title: {
    default: 'Gestión ROMEZ',
    template: '%s · Gestión ROMEZ',
  },
  description: 'Gestión contable, clientes, cobranzas y atención de ROMEZ Servicios Contables.',
  icons: { icon: '/favicon.ico', apple: '/brand/romez-navy.jpg' },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es-PY" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${inter.variable} ${poppins.variable}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
