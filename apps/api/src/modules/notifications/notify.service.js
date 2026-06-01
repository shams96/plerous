import { createTransport } from 'nodemailer'
import { Queue } from 'bullmq'
import { prisma } from '../../db/client.js'
import { config } from '../../config/index.js'

let twilioClient = null
try {
  if (config.twilio.accountSid && config.twilio.accountSid.startsWith('AC')) {
    const { default: twilio } = await import('twilio')
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken)
  }
} catch {}

const mailer = createTransport({
  host: config.email.host,
  port: config.email.port,
  auth: { user: config.email.user, pass: config.email.pass },
})

const notifyQueue = new Queue('notifications', {
  connection: { url: config.redis.url },
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
})

export class NotifyService {
  async sms(to, message, referralId, type) {
    const record = await prisma.notification.create({
      data: { referralId, type, channel: 'SMS', recipient: to, message, status: 'pending' },
    })

    if (!twilioClient) {
      console.log(`[SMS dev] To: ${to} | ${message}`)
      await prisma.notification.update({ where: { id: record.id }, data: { status: 'dev_logged' } })
      return { notificationId: record.id, status: 'dev_logged' }
    }

    try {
      const result = await twilioClient.messages.create({ body: message, from: config.twilio.phoneNumber, to })
      await prisma.notification.update({ where: { id: record.id }, data: { status: 'sent', externalId: result.sid, sentAt: new Date() } })
      return { notificationId: record.id, status: 'sent', sid: result.sid }
    } catch (err) {
      await prisma.notification.update({ where: { id: record.id }, data: { status: 'failed' } })
      console.error(`SMS failed to ${to}:`, err.message)
      return { notificationId: record.id, status: 'failed' }
    }
  }

  async email(to, subject, html, referralId, type) {
    const record = await prisma.notification.create({
      data: { referralId, type, channel: 'EMAIL', recipient: to, message: subject, status: 'pending' },
    })

    try {
      const info = await mailer.sendMail({ from: config.email.from, to, subject, html })
      await prisma.notification.update({ where: { id: record.id }, data: { status: 'sent', externalId: info.messageId, sentAt: new Date() } })
      return { notificationId: record.id, status: 'sent' }
    } catch (err) {
      await prisma.notification.update({ where: { id: record.id }, data: { status: 'failed' } })
      console.error(`Email failed to ${to}:`, err.message)
      return { notificationId: record.id, status: 'failed' }
    }
  }

  async scheduleReminder(referral, appointmentDate) {
    const reminderTime = new Date(appointmentDate)
    reminderTime.setHours(reminderTime.getHours() - 48)
    const delay = Math.max(0, reminderTime.getTime() - Date.now())

    await notifyQueue.add('appointment-reminder', {
      referralId: referral.id,
      patientPhone: referral.patient.phone,
      patientName: referral.patient.firstName,
      specialty: referral.specialty,
      appointmentDate: appointmentDate.toISOString(),
      authNumber: referral.authorization?.authNumber,
    }, { delay })
  }

  async sendWebhook(url, payload, secret) {
    const { createHmac } = await import('crypto')
    const sig = createHmac('sha256', secret || 'refchain-webhook-secret')
      .update(JSON.stringify(payload)).digest('hex')

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Plerous-Signature': `sha256=${sig}`,
          'X-Plerous-Event': payload.event || 'referral.updated',
        },
        body: JSON.stringify(payload),
      })
      return { delivered: resp.ok, status: resp.status }
    } catch (err) {
      console.error('Webhook failed:', err.message)
      return { delivered: false, status: 0 }
    }
  }

  async getHistory(referralId) {
    return prisma.notification.findMany({
      where: { referralId },
      orderBy: { createdAt: 'desc' },
    })
  }
}
