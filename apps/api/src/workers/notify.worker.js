import { Worker } from 'bullmq'
import { config } from '../config/index.js'
import { prisma } from '../db/client.js'

const worker = new Worker('notifications', async (job) => {
  const { name, data } = job

  if (name === 'appointment-reminder') {
    const { referralId, patientPhone, patientName, specialty, appointmentDate, authNumber } = data

    const apptDate = new Date(appointmentDate)
    const apptStr = apptDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const timeStr = apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    const message = `⏰ Reminder: ${patientName}, your ${specialty} appointment is TOMORROW — ${apptStr} at ${timeStr}. Auth #: ${authNumber || 'Contact office if needed'}. Reply HELP for questions.`

    console.log(`[Worker] Sending reminder SMS to ${patientPhone}: ${message}`)

    await prisma.notification.create({
      data: {
        referralId,
        type: 'APPOINTMENT_REMINDER',
        channel: 'SMS',
        recipient: patientPhone,
        message,
        status: 'queued',
        sentAt: new Date(),
      },
    })

    // In production: call Twilio here
  }
}, {
  connection: { url: config.redis.url },
  concurrency: 5,
})

worker.on('completed', (job) => {
  console.log(`[Worker] ✅ Job ${job.id} (${job.name}) completed`)
})

worker.on('failed', (job, err) => {
  console.error(`[Worker] ❌ Job ${job?.id} failed:`, err.message)
})

console.log('📬 Notification worker started')
