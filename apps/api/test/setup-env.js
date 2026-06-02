// Per-worker test setup: register the domain-event subscribers (Intelligence +
// Growth) so inline-dispatched events reach them. EVENTS_SYNC + secrets are set
// via vitest config `env` (before any module loads).
import '../src/events/subscribers.js'
