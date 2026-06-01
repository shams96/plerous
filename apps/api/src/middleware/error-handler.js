export class AppError extends Error {
  constructor(statusCode, message, details = null) {
    super(message)
    this.statusCode = statusCode
    this.details = details
  }
}

export function errorHandler(error, request, reply) {
  // Known app errors
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: error.message,
      ...(error.details && { details: error.details }),
    })
  }

  // Prisma not found
  if (error.code === 'P2025') {
    return reply.code(404).send({ success: false, error: 'Resource not found' })
  }

  // Prisma unique constraint
  if (error.code === 'P2002') {
    return reply.code(409).send({
      success: false,
      error: 'Resource already exists',
      details: error.meta?.target,
    })
  }

  // JWT errors
  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.code(401).send({ success: false, error: 'Token expired' })
  }
  if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    return reply.code(401).send({ success: false, error: 'Invalid token' })
  }

  // Validation errors (Zod / Fastify schema)
  if (error.validation) {
    return reply.code(422).send({
      success: false,
      error: 'Validation failed',
      details: error.validation,
    })
  }

  request.log.error(error)
  reply.code(500).send({ success: false, error: 'Internal server error' })
}
