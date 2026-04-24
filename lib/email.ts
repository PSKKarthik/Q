import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
} as nodemailer.TransportOptions)

interface EmailRecipient {
  email: string
  name?: string
}

interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[]
  subject: string
  html: string
}

interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return { success: false, error: 'Email service not configured' }

  const senderName = process.env.GMAIL_SENDER_NAME || 'QGX Platform'
  const senderEmail = process.env.GMAIL_USER

  const recipients = Array.isArray(opts.to) ? opts.to : [opts.to]
  const toField = recipients.map(r => r.name ? `"${r.name}" <${r.email}>` : r.email).join(', ')

  try {
    const info = await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: toField,
      subject: opts.subject,
      html: opts.html,
    })
    return { success: true, messageId: info.messageId }
  } catch (err) {
    return { success: false, error: (err as any)?.message || 'Email send failed' }
  }
}

// ── Batch sender with rate limiting ─────────────────────────
// Sends to many recipients in small chunks with a delay between
// each chunk so we stay within Brevo's free plan limits.
const BATCH_SIZE = 5   // emails per chunk
const BATCH_DELAY = 2000 // ms between chunks (30 emails/min max)

export async function sendEmailBatch(
  emails: string[],
  subject: string,
  html: string
): Promise<{ sent: number; failed: number }> {
  const unique = Array.from(new Set(emails.filter(Boolean)))
  let sent = 0, failed = 0

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      chunk.map(email => sendEmail({ to: { email }, subject, html }))
    )
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value.success) sent++
      else failed++
    })
    // Wait between chunks (skip delay after last chunk)
    if (i + BATCH_SIZE < unique.length) {
      await new Promise(res => setTimeout(res, BATCH_DELAY))
    }
  }

  return { sent, failed }
}

// ── Pre-built templates ──────────────────────────────────────

const baseStyle = `font-family:'Courier New',monospace;background:#0a0a0a;color:#e5e5e5;padding:40px 32px;max-width:560px;margin:0 auto;border:1px solid #222;`
const headingStyle = `font-size:28px;letter-spacing:0.15em;color:#ffffff;margin:0 0 8px 0;`
const dimStyle = `font-size:11px;color:#666;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 32px 0;`
const bodyStyle = `font-size:14px;line-height:1.7;color:#ccc;margin:0 0 24px 0;`
const btnStyle = `display:inline-block;background:#ffffff;color:#000000;padding:12px 28px;text-decoration:none;font-size:13px;letter-spacing:0.08em;font-family:'Courier New',monospace;`
const footerStyle = `font-size:10px;color:#444;margin-top:40px;border-top:1px solid #1a1a1a;padding-top:20px;`

export function emailTemplate(title: string, body: string, ctaLabel?: string, ctaUrl?: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#000;">
<div style="${baseStyle}">
  <div style="${headingStyle}">QGX</div>
  <div style="${dimStyle}">${title}</div>
  <div style="${bodyStyle}">${body}</div>
  ${ctaLabel && ctaUrl ? `<div style="margin-bottom:32px;"><a href="${ctaUrl}" style="${btnStyle}">${ctaLabel} →</a></div>` : ''}
  <div style="${footerStyle}">This email was sent by QGX Platform. Do not reply to this email.<br><a href="${siteUrl}" style="color:#444;">${siteUrl}</a></div>
</div></body></html>`
}

export function welcomeEmail(name: string, role: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Welcome to QGX',
    `Hi <strong>${name}</strong>,<br><br>Your <strong>${role}</strong> account has been created on the QGX Learning Platform.<br><br>Sign in to get started.`,
    'Sign In', `${siteUrl}/login`
  )
}

export function announcementEmail(title: string, body: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate('New Announcement', `<strong>${title}</strong><br><br>${body}`, 'View on QGX', `${siteUrl}/dashboard/student`)
}

export function testReminderEmail(name: string, testTitle: string, scheduledDate: string, scheduledTime: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Upcoming Test Reminder',
    `Hi <strong>${name}</strong>,<br><br>You have an upcoming test:<br><br><strong>${testTitle}</strong><br>Scheduled: ${scheduledDate} at ${scheduledTime}`,
    'View Tests', `${siteUrl}/dashboard/student`
  )
}

export function assignmentDueEmail(name: string, assignmentTitle: string, dueDate: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Assignment Due Soon',
    `Hi <strong>${name}</strong>,<br><br>Your assignment <strong>${assignmentTitle}</strong> is due on <strong>${dueDate}</strong>.`,
    'Submit Now', `${siteUrl}/dashboard/student`
  )
}

export function gradePostedEmail(name: string, assignmentTitle: string, grade: string, feedback?: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Grade Posted',
    `Hi <strong>${name}</strong>,<br><br>Your submission for <strong>${assignmentTitle}</strong> has been graded.<br><br>Grade: <strong>${grade}</strong>${feedback ? `<br><br>Feedback: ${feedback}` : ''}`,
    'View Grades', `${siteUrl}/dashboard/student`
  )
}

export function meetingBookedEmail(teacherName: string, parentName: string, date: string, startTime: string, endTime: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Meeting Booked',
    `Hi <strong>${teacherName}</strong>,<br><br><strong>${parentName}</strong> has booked a meeting with you.<br><br>Date: <strong>${date}</strong><br>Time: <strong>${startTime} — ${endTime}</strong>`,
    'View Meetings', `${siteUrl}/dashboard/teacher?tab=meetings`
  )
}

export function meetingCancelledEmail(recipientName: string, otherPartyName: string, date: string, startTime: string, endTime: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Meeting Cancelled',
    `Hi <strong>${recipientName}</strong>,<br><br>Your meeting with <strong>${otherPartyName}</strong> on <strong>${date}</strong> (${startTime} — ${endTime}) has been cancelled.`,
    'View Meetings', `${siteUrl}/dashboard/teacher?tab=meetings`
  )
}

export function studentLinkPinEmail(studentName: string, parentName: string, otp: string): string {
  return emailTemplate(
    'Parent Account Link Request',
    `Hi <strong>${studentName}</strong>,<br><br><strong>${parentName}</strong> wants to link your QGX account to their parent portal so they can view your progress.<br><br>Your verification code is:<br><br><div style="font-size:40px;letter-spacing:0.4em;font-family:'Courier New',monospace;color:#ffffff;background:#111;padding:20px 24px;display:inline-block;margin:16px 0;border:1px solid #333;">${otp}</div><br>This code expires in <strong>10 minutes</strong>.<br><br>If you did not expect this request, you can safely ignore this email — no action will be taken.`
  )
}

export function meetingRequestEmail(teacherName: string, parentName: string, date: string, startTime: string, endTime: string, message?: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Meeting Request',
    `Hi <strong>${teacherName}</strong>,<br><br><strong>${parentName}</strong> has requested a meeting with you.<br><br>Proposed: <strong>${date}</strong> · ${startTime} — ${endTime}${message ? `<br><br>Message: ${message}` : ''}`,
    'Review Request', `${siteUrl}/dashboard/teacher?tab=meetings`
  )
}

export function meetingRequestReviewedEmail(parentName: string, teacherName: string, date: string, startTime: string, endTime: string, status: 'approved' | 'rejected'): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    `Meeting Request ${status === 'approved' ? 'Approved' : 'Declined'}`,
    `Hi <strong>${parentName}</strong>,<br><br>Your meeting request with <strong>${teacherName}</strong> on <strong>${date}</strong> (${startTime} — ${endTime}) has been <strong>${status === 'approved' ? 'approved' : 'declined'}</strong>.${status === 'approved' ? '<br><br>Check your meetings to join the call.' : ''}`,
    'View Meetings', `${siteUrl}/dashboard/parent?tab=meetings`
  )
}

export function excuseSubmittedEmail(teacherName: string, studentName: string, parentName: string, date: string, reason: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Absence Excuse Submitted',
    `Hi <strong>${teacherName}</strong>,<br><br><strong>${parentName}</strong> has submitted an absence excuse for <strong>${studentName}</strong>.<br><br>Date: <strong>${date}</strong><br>Reason: ${reason}`,
    'Review Excuse', `${siteUrl}/dashboard/teacher?tab=excuses`
  )
}

export function excuseReviewedEmail(parentName: string, studentName: string, date: string, status: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Absence Excuse Reviewed',
    `Hi <strong>${parentName}</strong>,<br><br>The absence excuse for <strong>${studentName}</strong> on <strong>${date}</strong> has been <strong>${status}</strong>.`,
    'View Excuses', `${siteUrl}/dashboard/parent?tab=excuses`
  )
}

export function activationEmail(name: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Account Activated',
    `Hi <strong>${name}</strong>,<br><br>Your QGX account has been <strong>activated</strong>. You can now sign in and access the platform.`,
    'Sign In', `${siteUrl}/login`
  )
}

export function deactivationEmail(name: string): string {
  return emailTemplate(
    'Account Deactivated',
    `Hi <strong>${name}</strong>,<br><br>Your QGX account has been <strong>deactivated</strong> by an administrator. You will not be able to sign in until your account is reactivated.<br><br>If you believe this is an error, please contact your institution administrator.`
  )
}

export function userEditedEmail(name: string, changes: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Account Updated',
    `Hi <strong>${name}</strong>,<br><br>Your QGX account details have been updated by an administrator.<br><br>${changes}<br><br>If you did not expect this change, please contact your administrator.`,
    'Sign In', `${siteUrl}/login`
  )
}

export function testDeletedEmail(teacherName: string, testTitle: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Test Removed',
    `Hi <strong>${teacherName}</strong>,<br><br>Your test <strong>"${testTitle}"</strong> has been removed from the platform by an administrator.<br><br>If you believe this was done in error, please contact your institution administrator.`,
    'View Dashboard', `${siteUrl}/dashboard/teacher`
  )
}

export function attendanceReportEmail(recipientName: string, studentName: string, subject: string, present: number, total: number, rate: number): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const color = rate >= 80 ? '#22c55e' : rate >= 60 ? '#f59e0b' : '#ef4444'
  return emailTemplate(
    'Attendance Report',
    `Hi <strong>${recipientName}</strong>,<br><br>Here is the attendance report for <strong>${studentName}</strong> in <strong>${subject}</strong>:<br><br>
    <div style="background:#111;padding:16px;border:1px solid #222;margin:12px 0;">
      <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;">Attendance Summary</div>
      <div style="font-size:28px;font-weight:700;color:${color};font-family:'Courier New',monospace;">${rate}%</div>
      <div style="font-size:12px;color:#ccc;margin-top:4px;">${present} present out of ${total} sessions</div>
    </div>
    ${rate < 80 ? '<br><strong style="color:#f59e0b;">⚠ Attendance is below the recommended 80% threshold.</strong>' : ''}`,
    'View Full Report', `${siteUrl}/dashboard/parent`
  )
}

export function userCredentialsEmail(name: string, email: string, role: string, resetLink: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return emailTemplate(
    'Your QGX Account',
    `Hi <strong>${name}</strong>,<br><br>An account has been created for you on the QGX Learning Platform.<br><br>Email: <strong>${email}</strong><br>Role: <strong>${role}</strong><br><br>Click the button below to set your password and get started.`,
    'Set Password', resetLink || `${siteUrl}/login`
  )
}
