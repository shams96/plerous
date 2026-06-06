import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Plerous Terms of Service — the agreement governing your use of the Plerous platform.',
  alternates: { canonical: 'https://plerous.com/terms' },
}

export default function TermsPage() {
  const updated = 'June 4, 2026'
  return (
    <div className="min-h-screen" style={{ background: 'var(--rc-bg)', color: 'var(--rc-text)' }}>
      <div className="max-w-3xl mx-auto px-6 py-20">
        <Link href="/" className="text-sm font-medium mb-10 inline-flex items-center gap-2" style={{ color: 'var(--rc-accent)' }}>
          ← Back to Plerous
        </Link>

        <h1 className="text-4xl font-black mb-2 rc-text">Terms of Service</h1>
        <p className="text-sm rc-muted mb-12">Last updated: {updated}</p>

        <div className="prose prose-sm max-w-none space-y-8 rc-muted">

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">1. Agreement</h2>
            <p>By accessing or using Plerous (&ldquo;Service&rdquo;), operated by 1hubsolutions, LLC (&ldquo;Company&rdquo;), you agree to these Terms. If you are using the Service on behalf of an organization, you represent that you have authority to bind that organization.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">2. Description of Service</h2>
            <p>Plerous provides closed-loop referral management infrastructure including prior authorization submission, delivery, intake, AI-assisted documentation review (PAIA), and referral monitoring (Sentinel) for independent medical practices and healthcare organizations.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">3. HIPAA Business Associate Agreement</h2>
            <p>If you are a Covered Entity or Business Associate under HIPAA and will submit Protected Health Information through the Service, you must execute a Business Associate Agreement (BAA) with Plerous before doing so. Contact <a href="mailto:hello@plerous.com" style={{ color: 'var(--rc-accent)' }}>hello@plerous.com</a> to execute a BAA.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">4. Acceptable Use</h2>
            <p>You agree to use the Service only for lawful healthcare operations. You may not:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Submit fraudulent or falsified clinical information</li>
              <li>Attempt to reverse-engineer, scrape, or disrupt the Service</li>
              <li>Use the Service in violation of HIPAA or any applicable law</li>
              <li>Share credentials or allow unauthorized access to your account</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">5. AI-Assisted Features</h2>
            <p>PAIA and other AI features are decision-support tools. They do not constitute medical advice or legal compliance determinations. All clinical and billing decisions remain the responsibility of the licensed provider. You must review AI recommendations before submitting prior authorization requests.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">6. Subscription and Payment</h2>
            <p>Paid plans are billed monthly or annually as selected. Subscriptions auto-renew unless cancelled before the renewal date. Refunds are available within 7 days of initial subscription. No refunds are issued for partial months after the refund window.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">7. Availability and SLA</h2>
            <p>We target 99.5% uptime for paid plans. Scheduled maintenance is announced 48 hours in advance. The Service is provided &ldquo;as is&rdquo; for the free Starter tier without uptime guarantees.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Plerous is not liable for indirect, incidental, or consequential damages. Our total liability for any claim is limited to the amount paid by you in the 3 months preceding the claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">9. Termination</h2>
            <p>Either party may terminate at any time. Upon termination, your data remains available for 30 days for export, after which it is deleted per our retention policy. We may suspend accounts for violations of these Terms.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">10. Governing Law</h2>
            <p>These Terms are governed by the laws of the United States. Disputes will be resolved by binding arbitration under JAMS rules, except that either party may seek injunctive relief in court.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold rc-text mb-3">11. Contact</h2>
            <p>Questions about these Terms:<br />
            <a href="mailto:hello@plerous.com" style={{ color: 'var(--rc-accent)' }}>hello@plerous.com</a><br />
            Plerous · 1hubsolutions, LLC</p>
          </section>

        </div>
      </div>
    </div>
  )
}
