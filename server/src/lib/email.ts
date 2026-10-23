import { isProduction } from '../config.js';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = (process.env.EMAIL_FROM || 'Roviel <noreply@roviel.app>').trim();
  if (!apiKey) {
    if (!isProduction) {
      console.info(`[email] Password reset link for ${email}: ${resetUrl}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not configured.');
  }
  const text = [
    'Reset your Roviel password',
    '',
    'Use this single-use link to choose a new password. It expires in 30 minutes:',
    resetUrl,
    '',
    'If you did not request this, you can ignore this email. Your password has not changed.',
  ].join('\n');
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.5;color:#171a20;max-width:560px">
    <h1 style="font-size:22px">Reset your Roviel password</h1>
    <p>Use this single-use link to choose a new password. It expires in 30 minutes.</p>
    <p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:11px 18px;border-radius:6px;background:#c6f432;color:#10140b;font-weight:700;text-decoration:none">Choose a new password</a></p>
    <p style="color:#5b6068;font-size:13px">If you did not request this, you can ignore this email. Your password has not changed.</p>
  </div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject: 'Reset your Roviel password', text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Password reset email failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
}
