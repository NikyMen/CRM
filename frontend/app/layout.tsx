import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ThemeScript } from './theme-script'
import { Inter, Poppins } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-poppins' })

export const metadata: Metadata = {
  title: 'CRM · Consultoría Digital',
  description: 'Consola operativa de Consultoría Digital',
  icons: { icon: '/brand/favicon.png' },
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
      <body className={`${inter.variable} ${poppins.variable}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
