import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Resend } from 'resend'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { to_email, to_name, trainer_name, register_url } = req.body ?? {}

  if (!to_email || !to_name || !trainer_name || !register_url) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' })
  }

  const resend = new Resend(apiKey)
  const firstName = to_name.split(' ')[0]

  const { error } = await resend.emails.send({
    from: 'Z6 Training <noreply@z6training.com>',
    to: [to_email],
    subject: `${trainer_name} invited you to Z6 Training`,
    html: `
      <div style="background:#0A0A0A;padding:40px 0;font-family:'Helvetica Neue',Arial,sans-serif;">
        <div style="max-width:480px;margin:0 auto;background:#1C1C1E;border-radius:16px;overflow:hidden;">
          <div style="padding:32px 32px 24px;border-bottom:1px solid #2C2C2E;">
            <span style="font-size:28px;font-weight:700;color:#C9A84C;letter-spacing:2px;">Z6 TRAINING</span>
          </div>
          <div style="padding:32px;">
            <p style="color:#ffffff;font-size:18px;font-weight:600;margin:0 0 12px;">Hey ${firstName},</p>
            <p style="color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;margin:0 0 24px;">
              <strong style="color:#fff;">${trainer_name}</strong> has added you as a client on Z6 Training.
              Click below to create your account and get started.
            </p>
            <a href="${register_url}"
              style="display:block;background:#C9A84C;color:#000;text-align:center;text-decoration:none;
                     font-weight:700;font-size:15px;letter-spacing:1px;padding:16px 24px;border-radius:10px;">
              CREATE MY ACCOUNT
            </a>
            <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:20px 0 0;line-height:1.5;">
              Select <strong style="color:rgba(255,255,255,0.4);">I am a client</strong>
              and register with: <strong style="color:rgba(255,255,255,0.4);">${to_email}</strong>
            </p>
          </div>
        </div>
      </div>
    `,
  })

  if (error) {
    console.error('Resend error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ ok: true })
}
