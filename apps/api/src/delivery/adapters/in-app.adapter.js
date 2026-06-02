/**
 * In-app delivery adapter — the receiving specialist is on-network, so the
 * referral simply appears in their Plerous queue. No external transmission;
 * "delivered" means it's visible to them. Confirmation (RECEIVED) still comes
 * from their explicit acknowledge action.
 */
export async function send({ referral, party }) {
  return {
    channel: 'in_app',
    status: 'delivered',
    externalId: party.provider?.id ?? party.org?.id ?? null,
    proof: { queue: 'plerous', org: party.org?.name ?? null },
  }
}
