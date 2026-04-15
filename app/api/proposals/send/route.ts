// POST /api/proposals/send — email a proposal to the property owner
// Uses Resend if RESEND_API_KEY is set, otherwise returns a mailto: URI
// so the frontend can open the user's default email client with content pre-filled.
import { NextRequest, NextResponse } from 'next/server'
import { requireUser, requireTier } from '@/lib/apiAuth'
import { log } from '@/lib/logger'

interface SendProposalBody {
  to_email: string
  to_name: string
  subject?: string
  address: string
  owner_name: string
  total: number
  line_items: Array<{ description: string; quantity: number; unit: string; unit_price: number; total: number }>
  notes?: string
  company_name?: string
  company_phone?: string
  proposal_id: string
}

export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response
  const tierDenied = requireTier(auth, 'proposals')
  if (tierDenied) return tierDenied

  let body: SendProposalBody
  try {
    body = await req.json() as SendProposalBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { to_email, to_name, address, owner_name, total, line_items, notes, company_name, company_phone, proposal_id } = body

  if (!to_email || !address) {
    return NextResponse.json({ error: 'to_email and address are required' }, { status: 400 })
  }

  const subject = body.subject || `Roofing Proposal — ${address}`

  // ── Build text/HTML email body ──────────────────────────────────────────────
  const lineItemsText = line_items.map(li =>
    `  ${li.description.padEnd(40)} ${String(li.quantity).padStart(4)} ${li.unit.padEnd(4)} @ $${li.unit_price.toFixed(2).padStart(8)} = $${li.total.toFixed(2)}`
  ).join('\n')

  const lineItemsHtml = line_items.map(li => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${li.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${li.quantity} ${li.unit}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">$${li.unit_price.toFixed(2)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">$${li.total.toFixed(2)}</td>
    </tr>`).join('')

  const textBody = `
Dear ${to_name || owner_name},

Thank you for the opportunity to provide a roofing estimate for:
  ${address}

PROPOSAL SUMMARY
${'─'.repeat(60)}
${lineItemsText}
${'─'.repeat(60)}
TOTAL: $${total.toFixed(2).padStart(10)}

${notes ? `Notes:\n${notes}\n` : ''}
To accept this proposal or schedule an inspection, please reply to this email or call us at ${company_phone || 'our office'}.

Best regards,
${company_name || 'Directive CRM'}
  `.trim()

  const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#111;background:#fff;margin:0;padding:0;}
  .wrapper{max-width:600px;margin:32px auto;padding:0 16px;}
  h2{color:#0891b2;margin-bottom:4px;}
  .address{font-size:14px;color:#6b7280;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;font-size:13px;}
  th{background:#f9fafb;padding:8px;text-align:left;border-bottom:2px solid #e5e7eb;}
  .total-row td{padding:10px 8px;font-size:15px;font-weight:700;border-top:2px solid #111;}
  .footer{margin-top:32px;font-size:12px;color:#6b7280;}
</style></head>
<body><div class="wrapper">
  <h2>Roofing Proposal</h2>
  <p class="address">Property: <strong>${address}</strong></p>
  <p>Dear ${to_name || owner_name},</p>
  <p>Thank you for the opportunity to provide a roofing estimate. Please review the proposal below.</p>
  <table>
    <thead>
      <tr>
        <th>Description</th><th style="text-align:right">Qty</th>
        <th style="text-align:right">Unit Price</th><th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>${lineItemsHtml}</tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="3">Total</td>
        <td style="text-align:right">$${total.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  ${notes ? `<p style="margin-top:20px;font-size:13px;color:#374151;"><strong>Notes:</strong> ${notes}</p>` : ''}
  <p style="margin-top:24px;">To accept or schedule an inspection, reply to this email${company_phone ? ` or call <strong>${company_phone}</strong>` : ''}.</p>
  <p class="footer">— ${company_name || 'Directive CRM'} | Proposal ID: ${proposal_id}</p>
</div></body></html>`.trim()

  // ── Try Resend if configured ────────────────────────────────────────────────
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${company_name || 'Directive CRM'} <proposals@${process.env.RESEND_FROM_DOMAIN || 'directive-crm.com'}>`,
          to: [to_email],
          subject,
          text: textBody,
          html: htmlBody,
        }),
      })

      const resendData = await resendRes.json() as { id?: string; error?: { message: string } }

      if (!resendRes.ok || resendData.error) {
        log.warn('/api/proposals/send', 'Resend delivery failed', { error: resendData.error, to: to_email })
        // Fall through to mailto fallback
      } else {
        log.info('/api/proposals/send', 'Proposal sent via Resend', { id: resendData.id, to: to_email, proposal_id })
        return NextResponse.json({ ok: true, method: 'resend', message_id: resendData.id })
      }
    } catch (e) {
      log.error('/api/proposals/send', e)
      // Fall through to mailto
    }
  }

  // ── Mailto fallback — return a pre-filled mailto URI ───────────────────────
  const mailtoBody = encodeURIComponent(textBody)
  const mailtoSubject = encodeURIComponent(subject)
  const mailtoUri = `mailto:${to_email}?subject=${mailtoSubject}&body=${mailtoBody}`

  log.info('/api/proposals/send', 'Returning mailto fallback (no Resend key)', { to: to_email, proposal_id })

  return NextResponse.json({
    ok: false,
    method: 'mailto',
    mailto_uri: mailtoUri,
    message: 'RESEND_API_KEY not configured — open your email client to send manually.',
  })
}
