import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Plerous Privacy Policy — how we collect, use, and protect your information.',
  alternates: { canonical: 'https://plerous.com/privacy' },
}

export default function PrivacyPage() {
  const updated = 'June 4, 2026'
  return (
    <div className="min-h-screen" style={{ background: 'var(--rc-bg)', color: 'var(--rc-text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm font-medium mb-10 inline-flex items-center gap-2" style={{ color: 'var(--rc-accent)' }}>
          ← Back to Plerous
        </Link>

        <h1 className="text-4xl font-black mb-2 rc-text">Privacy Policy</h1>
        <p className="text-sm rc-muted mb-12">Last updated: {updated}</p>

        <div className="prose prose-sm max-w-none space-y-8 rc-muted">

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">1. Who We Are</h2>
            <p>Plerous (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is a healthcare technology company operating at <strong>plerous.com</strong> and providing closed-loop referral infrastructure for independent medical practices. Our contact email is <a href="mailto:hello@plerous.com" style={{ color: 'var(--rc-accent)' }}>hello@plerous.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">2. HIPAA Compliance</h2>
            <p>Plerous is designed to comply with the Health Insurance Portability and Accountability Act (HIPAA). We act as a Business Associate to our covered-entity customers. Protected Health Information (PHI) is:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Encrypted at rest (AES-256) and in transit (TLS 1.2+)</li>
              <li>Accessed only by authorized personnel and systems</li>
              <li>Never sold, shared with advertisers, or used for marketing</li>
              <li>Subject to a Business Associate Agreement (BAA) with each customer</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">3. Information We Collect</h2>
            <h3 className="font-semibold rc-text mb-1">Account Information</h3>
            <p>Name, email address, organization name, NPI number, and billing information when you register.</p>
            <h3 className="font-semibold rc-text mb-1 mt-4">Clinical Information (PHI)</h3>
            <p>Patient demographics, insurance information, diagnosis codes, referral details, and prior authorization data submitted by authorized users. This data is processed solely to provide our services.</p>
            <h3 className="font-semibold rc-text mb-1 mt-4">Usage Data</h3>
            <p>Log data, IP addresses, browser type, and platform analytics to improve the service. No PHI is included in usage analytics.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">4. How We Use Your Information</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>To provide, operate, and improve the Plerous platform</li>
              <li>To process prior authorization submissions to payers on your behalf</li>
              <li>To send service notifications (SLA alerts, auth status updates)</li>
              <li>To comply with legal and regulatory obligations</li>
            </ul>
            <p className="mt-3">We do <strong>not</strong> use PHI for AI model training without explicit written consent.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">5. Data Sharing</h2>
            <p>We share data only as necessary to provide our services:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Payers and clearinghouses</strong> — to submit prior authorizations (UHC, Aetna, BCBS, etc.)</li>
              <li><strong>Infrastructure providers</strong> — Supabase (database), Upstash (cache), Anthropic (AI processing) under BAAs where applicable</li>
              <li><strong>Law enforcement</strong> — only when required by valid legal process</li>
            </ul>
            <p className="mt-3">We never sell personal data or PHI to third parties.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">6. Data Retention</h2>
            <p>We retain PHI for the minimum period required by applicable law (typically 6 years under HIPAA). Account data is deleted within 30 days of account closure upon request. Audit logs are retained for 7 years to meet HIPAA requirements.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">7. Your Rights</h2>
            <p>Depending on your jurisdiction, you may have the right to access, correct, or delete your personal information. To exercise these rights, email <a href="mailto:hello@plerous.com" style={{ color: 'var(--rc-accent)' }}>hello@plerous.com</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">8. Security</h2>
            <p>We implement administrative, physical, and technical safeguards including encryption at rest and in transit, role-based access control, MFA, SHA-256 tamper-evident audit logs, and regular security reviews.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">9. Changes to This Policy</h2>
            <p>We may update this policy periodically. Material changes will be communicated via email to account holders at least 30 days before taking effect.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">10. Contact</h2>
            <p>For privacy questions or to exercise your rights:<br />
            <a href="mailto:hello@plerous.com" style={{ color: 'var(--rc-accent)' }}>hello@plerous.com</a><br />
            Plerous · 1hubsolutions, LLC</p>
          </section>
        </div>
      </div>
    </div>
  )
}
