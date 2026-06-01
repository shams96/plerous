import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from '@/components/ThemeProvider'

export const metadata: Metadata = {
  title: 'Plerous — Healthcare Closed-Loop Solutions',
  description: 'The FHIR R4 closed-loop infrastructure that stops prior auth denials before they happen. Built for independent practices. CMS-0057-F compliant.',
  keywords: ['prior authorization', 'FHIR R4', 'healthcare referrals', 'CMS-0057-F', 'PAIA', 'closed-loop healthcare', 'referral management'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <body className="bg-stone-50 text-slate-900 antialiased" suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
