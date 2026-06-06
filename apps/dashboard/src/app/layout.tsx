import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

const BASE_URL = 'https://plerous.com'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Plerous — Closed-Loop Referral Infrastructure for Independent Practices',
    template: '%s | Plerous',
  },
  description:
    'Stop losing revenue to referrals that disappear. Plerous is FHIR R4 closed-loop referral infrastructure — prior auth, delivery, intake, and AI intelligence for independent practices. CMS-0057-F ready.',
  keywords: [
    'prior authorization software',
    'FHIR R4 referral management',
    'healthcare referral infrastructure',
    'CMS-0057-F compliance',
    'prior auth automation',
    'independent practice referral',
    'PAIA healthcare',
    'Da Vinci PAS',
    'referral management system',
    'closed-loop referral',
  ],
  authors: [{ name: 'Plerous', url: BASE_URL }],
  creator: 'Plerous',
  publisher: 'Plerous',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: BASE_URL,
    siteName: 'Plerous',
    title: 'Plerous — Closed-Loop Referral Infrastructure',
    description:
      '1 in 3 referrals never reach the specialist. Plerous closes the loop — FHIR R4 prior auth, AI-powered PAIA checks, and 24/7 Sentinel monitoring for independent practices.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Plerous — Closed-Loop Referral Infrastructure',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Plerous — Closed-Loop Referral Infrastructure',
    description:
      '1 in 3 referrals never reach the specialist. Plerous closes the loop with FHIR R4 prior auth and AI-powered PAIA checks.',
    images: ['/og-image.png'],
    creator: '@plerous',
  },
  alternates: {
    canonical: BASE_URL,
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
  category: 'healthcare technology',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* Structured data — Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Plerous',
              url: BASE_URL,
              description:
                'Closed-loop referral infrastructure for independent healthcare practices. FHIR R4 prior authorization, AI-powered PAIA checks, and 24/7 Sentinel monitoring.',
              applicationCategory: 'HealthApplication',
              operatingSystem: 'Web',
              offers: {
                '@type': 'Offer',
                price: '99',
                priceCurrency: 'USD',
                priceSpecification: { '@type': 'UnitPriceSpecification', billingDuration: 'P1M' },
              },
              contactPoint: {
                '@type': 'ContactPoint',
                email: 'hello@plerous.com',
                contactType: 'customer support',
              },
            }),
          }}
        />
      </head>
      <body className="bg-stone-50 text-slate-900 antialiased" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
