/**
 * Central subscriber registration. Imported by the API on boot and by the test
 * harness so every process that emits events also fans them out to the right
 * reactive subsystems. Add new subscribers here — the core flow never changes.
 */
import { on } from './bus.js'
import { handleEvent as intelligence } from '../intelligence/intelligence.subscriber.js'
import { handleEvent as growth } from '../growth/growth.subscriber.js'

let registered = false
export function registerSubscribers() {
  if (registered) return
  registered = true
  on('*', 'intelligence', intelligence) // Referral Intelligence (the moat)
  on('*', 'growth', growth)             // Growth / prospect engine
}

registerSubscribers()
