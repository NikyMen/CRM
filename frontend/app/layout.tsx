import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { ThemeScript } from './theme-script'
import { brand, brandColorCss } from '@/lib/brand'
import { Inter, Poppins } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const poppins = Poppins({ subsets: ['latin'], weight: ['600', '700', '800'], variable: '--font-poppins' })

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  icons: { icon: brand.favicon, apple: brand.logoOnDark },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const colorCss = brandColorCss()
  return (
    <html lang="es-PY" suppressHydrationWarning>
      <head>
        <ThemeScript />
        {colorCss ? <style id="brand-colors" dangerouslySetInnerHTML={{ __html: colorCss }} /> : null}
      </head>
      <body className={`${inter.variable} ${poppins.variable}`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
