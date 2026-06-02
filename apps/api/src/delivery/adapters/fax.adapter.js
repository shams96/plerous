/**
 * Fax delivery adapter — sends a referral packet to an off-network specialist
 * via a fax provider (sim in dev/test; Phaxio/Documo/Twilio Fax in prod).
 *
 * Honesty: fax yields ONLY transmit-level proof ("the pages went through"), not
 * human receipt. So a successful send sets Delivery.status = "transmitted",
 * never "confirmed". Confirmation comes out-of-band (secure-link ack / call).
 */
import axios from 'axios'
import { config } from '../../config/index.js'

export async function send({ to, content, referralId }) {
  const res = await axios.post(
    `${config.fax.providerUrl}/fax/send`,
    { to, content, referralId },
    { headers: { 'Content-Type': 'application/json' }, timeout: 12000 },
  )
  const data = res.data || {}
  return {
    channel: 'fax',
    status: data.status === 'transmitted' ? 'transmitted' : 'failed',
    externalId: data.sid ?? null,
    proof: { pages: data.pages ?? null, faxStatus: data.status ?? null },
  }
}
