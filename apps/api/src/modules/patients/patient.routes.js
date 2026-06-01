import { authenticate } from '../../middleware/auth.middleware.js'
import { prisma } from '../../db/client.js'

export default async function patientRoutes(app) {
  app.post('/', {
    preHandler: [authenticate],
    schema: {
      tags: ['Patients'],
      summary: 'Create patient record',
      body: {
        type: 'object',
        required: ['firstName', 'lastName', 'dateOfBirth', 'phone'],
        properties: {
          firstName:           { type: 'string' },
          lastName:            { type: 'string' },
          dateOfBirth:         { type: 'string', format: 'date' },
          gender:              { type: 'string' },
          phone:               { type: 'string' },
          email:               { type: 'string', format: 'email' },
          mrn:                 { type: 'string' },
          address:             { type: 'object' },
          primaryInsuranceId:  { type: 'string' },
          insuranceMemberId:   { type: 'string' },
          insuranceGroupNumber:{ type: 'string' },
          smsOptIn:            { type: 'boolean' },
          preferredLang:       { type: 'string' },
        },
      },
    },
  }, async (req, reply) => {
    const patient = await prisma.patient.create({
      data: {
        ...req.body,
        dateOfBirth: new Date(req.body.dateOfBirth),
        address: req.body.address || {},
      },
    })
    reply.code(201).send({ success: true, data: patient })
  })

  app.get('/search', {
    preHandler: [authenticate],
    schema: {
      tags: ['Patients'],
      summary: 'Search patients (name, MRN, member ID)',
      querystring: {
        type: 'object',
        properties: {
          q:     { type: 'string' },
          limit: { type: 'integer', default: 10 },
        },
      },
    },
  }, async (req, reply) => {
    // support both ?q= (legacy) and ?search= (used by referral form)
    const { q, search, limit = 50 } = req.query
    const term = q || search

    const patients = await prisma.patient.findMany({
      where: term
        ? {
            OR: [
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName:  { contains: term, mode: 'insensitive' } },
              { mrn:       { contains: term } },
              { insuranceMemberId: { contains: term } },
            ],
          }
        : {},
      take: parseInt(limit),
      orderBy: { lastName: 'asc' },
      include: { primaryInsurance: { include: { payer: true } } },
    })

    reply.send({ success: true, data: patients })
  })

  // GET / — alias that supports ?search= directly (used by referral form)
  app.get('/', {
    preHandler: [authenticate],
    schema: { tags: ['Patients'], summary: 'List/search patients' },
  }, async (req, reply) => {
    const { search, limit = 50 } = req.query
    const patients = await prisma.patient.findMany({
      where: search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName:  { contains: search, mode: 'insensitive' } },
              { mrn:       { contains: search } },
              { insuranceMemberId: { contains: search } },
            ],
          }
        : {},
      take: parseInt(limit),
      orderBy: { lastName: 'asc' },
      include: { primaryInsurance: { include: { payer: true } } },
    })
    reply.send({ success: true, data: patients })
  })

  app.get('/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Patients'], summary: 'Get patient with insurance details' },
  }, async (req, reply) => {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        primaryInsurance: { include: { payer: true } },
        referrals: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    })
    if (!patient) return reply.code(404).send({ success: false, error: 'Patient not found' })
    reply.send({ success: true, data: patient })
  })
}
