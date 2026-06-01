import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { config } from './config/index.js'
import { hipaaLogger } from './middleware/hipaa-logger.js'
import { errorHandler } from './middleware/error-handler.js'

// Route modules
import referralRoutes, { humanWindowRoutes } from './modules/referrals/referral.routes.js'
import priorAuthRoutes from './modules/auth/auth.routes.js'
import providerRoutes from './modules/providers/provider.routes.js'
import aiRoutes from './modules/ai/ai.routes.js'
import notifyRoutes from './modules/notifications/notify.routes.js'
import patientRoutes from './modules/patients/patient.routes.js'
import ehrRoutes from './ehr/ehr.routes.js'
import onboardingRoutes from './modules/onboarding/onboarding.routes.js'
import sessionRoutes from './modules/session/session.routes.js'
import adminRoutes from './modules/admin/admin.routes.js'
import agentRoutes from './modules/agents/brief.routes.js'
import { startSentinel } from './workers/sentinel.worker.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'warn' : 'info',
      transport: config.env !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
        : undefined,
    },
  })

  // ── Security ─────────────────────────────────────────────────────────────────
  await app.register(helmet, { contentSecurityPolicy: false })

  await app.register(cors, {
    origin: config.env === 'production'
      ? ['https://app.refchain.ai', 'https://dashboard.refchain.ai']
      : true,
    credentials: true,
  })

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
    errorResponseBuilder: () => ({
      success: false,
      error: 'Rate limit exceeded — max 300 requests/minute',
    }),
  })

  // ── Auth ──────────────────────────────────────────────────────────────────────
  await app.register(jwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiry },
  })

  // ── Swagger Docs ──────────────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Plerous API',
        description: `
## Plerous — Healthcare Referral Management Platform
FHIR R4 native API with AI-powered prior authorization and EHR Intelligence Registry.

### Authentication
- **Bearer JWT**: \`Authorization: Bearer <token>\`
- **API Key**: \`x-api-key: rc_live_...\`

### Base URL
- Development: \`http://localhost:3001\`
- Production: \`https://api.refchain.ai\`
        `,
        version: '1.0.0',
        contact: { email: 'api@refchain.ai' },
        license: { name: 'Proprietary' },
      },
      servers: [
        { url: config.apiBaseUrl, description: 'Current' },
        { url: 'https://api.refchain.ai', description: 'Production' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        },
      },
      security: [{ bearerAuth: [] }, { apiKey: [] }],
      tags: [
        { name: 'Referrals', description: 'Referral lifecycle management' },
        { name: 'Prior Authorization', description: 'HMO auth workflows' },
        { name: 'AI', description: 'Risk scoring, provider matching, appeal generation' },
        { name: 'EHR', description: 'EHR Intelligence Registry — auto-discovery & integration' },
        { name: 'Providers', description: 'Provider directory & network' },
        { name: 'Patients', description: 'Patient records' },
        { name: 'Notifications', description: 'SMS, email, webhooks' },
      ],
    },
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, displayRequestDuration: true },
    staticCSP: true,
  })

  // ── Hooks ─────────────────────────────────────────────────────────────────────
  app.addHook('onRequest', hipaaLogger)
  app.setErrorHandler(errorHandler)

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: config.env,
  }))

  // ── Routes ────────────────────────────────────────────────────────────────────
  await app.register(referralRoutes,    { prefix: '/v1/referrals' })
  await app.register(humanWindowRoutes, { prefix: '/v1' })
  await app.register(priorAuthRoutes,   { prefix: '/v1/auth' })
  await app.register(providerRoutes,    { prefix: '/v1/providers' })
  await app.register(aiRoutes,          { prefix: '/v1/ai' })
  await app.register(notifyRoutes,      { prefix: '/v1/notify' })
  await app.register(patientRoutes,     { prefix: '/v1/patients' })
  await app.register(ehrRoutes,         { prefix: '/v1/ehr' })
  await app.register(onboardingRoutes,  { prefix: '/v1/onboarding' })
  await app.register(sessionRoutes,     { prefix: '/v1/session' })
  await app.register(adminRoutes,       { prefix: '/v1/admin' })
  await app.register(agentRoutes,       { prefix: '/v1/agents' })

  // FHIR R4 CapabilityStatement (Da Vinci PAS compliant)
  app.get('/fhir/r4/metadata', { schema: { hide: true } }, async (req) => {
    const { buildCapabilityStatement } = await import('./fhir/davinci-pas.js')
    const serverUrl = `${req.protocol}://${req.hostname}:${config.port}/fhir/r4`
    return buildCapabilityStatement(serverUrl)
  })

  return app
}

// ── Start ─────────────────────────────────────────────────────────────────────
const app = await buildApp()

try {
  await app.listen({ port: config.port, host: '0.0.0.0' })

  // Start background workers after server is up
  await startSentinel()

  console.log(`
╔══════════════════════════════════════════════════╗
║  ⚡ Plerous API — Phase 1                       ║
║                                                  ║
║  🌐  http://localhost:${config.port}                   ║
║  📚  Docs: http://localhost:${config.port}/docs         ║
║  🏥  FHIR: http://localhost:${config.port}/fhir/r4     ║
║                                                  ║
║  🧠  EHR Intelligence Registry: ACTIVE          ║
║  🔒  HIPAA Audit Logging: ACTIVE                ║
║  🤖  AI Agents: ACTIVE                          ║
╚══════════════════════════════════════════════════╝
  `)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
