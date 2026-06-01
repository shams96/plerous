import 'dotenv/config'

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001'),
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3001',

  db: { url: process.env.DATABASE_URL },
  redis: { url: process.env.REDIS_URL || 'redis://localhost:6379' },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiry: process.env.JWT_EXPIRY || '8h',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },

  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },

  email: {
    host: process.env.SMTP_HOST || 'smtp.resend.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM || 'noreply@refchain.ai',
  },

  payers: {
    uhc: {
      baseUrl: process.env.UHC_API_BASE_URL || 'https://sandbox.apis.uhc.com',
      clientId: process.env.UHC_CLIENT_ID,
      clientSecret: process.env.UHC_CLIENT_SECRET,
    },
    bcbs: {
      baseUrl: process.env.BCBS_API_BASE_URL || 'https://sandbox.bcbs.com/fhir/r4',
      apiKey: process.env.BCBS_API_KEY,
    },
  },

  encryption: { key: process.env.ENCRYPTION_KEY },

  eir: {
    autoDiscovery: process.env.EIR_AUTO_DISCOVERY !== 'false',
    confidenceThreshold: parseInt(process.env.EIR_CONFIDENCE_THRESHOLD || '90'),
  },

  // SMART on FHIR
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
  smart: {
    defaultClientId: process.env.SMART_CLIENT_ID || 'refchain_app',
  },
}

// Validate critical env vars
const required = ['DATABASE_URL', 'JWT_SECRET']
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required env var: ${key}`)
    process.exit(1)
  }
}
