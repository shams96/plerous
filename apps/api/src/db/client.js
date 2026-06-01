import { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import { config } from '../config/index.js'

// ─── Prisma ───────────────────────────────────────────────────────────────────
const globalForPrisma = globalThis

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: config.env === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (config.env !== 'production') globalForPrisma.prisma = prisma

// ─── Redis ────────────────────────────────────────────────────────────────────
export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
})

redis.on('error', (err) => {
  console.error('Redis error:', err.message)
})

redis.on('connect', () => {
  console.log('✅ Redis connected')
})

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  await prisma.$disconnect()
  redis.disconnect()
})
