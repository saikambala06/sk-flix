'use strict';

const nodemailer = require('nodemailer');

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;
const BRAND = process.env.BRAND_NAME || 'SkFlip';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!EMAIL_USER || !EMAIL_PASS) return null;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    pool: false,
  });
  return transporter;
}

function isMailConfigured() {
  return Boolean(EMAIL_USER && EMAIL_PASS);
}

function resetTemplate(code, name) {
  const safeName = String(name || 'there').replace(/[<>&]/g, '');
  return `
<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#0b0b14;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:480px;margin:0 auto;background:#14141f;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.08)">
      <tr>
        <td style="padding:32px 32px 8px">
          <div style="font-size:22px;font-weight:700;letter-spacing:.5px;color:#f0f0f8">
            SK<span style="color:#e0a830">FLIX</span>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 32px 0;color:#c9c9dd;font-size:15px;line-height:1.6">
          <p style="margin:0 0 8px">Hi ${safeName},</p>
          <p style="margin:0">Here is the code to reset your ${BRAND} password.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 32px">
          <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:#e0a830;background:#0b0b14;border:1px solid rgba(224,168,48,.3);padding:18px;border-radius:12px;text-align:center">${code}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 32px 32px;color:#8888aa;font-size:13px;line-height:1.6">
          <p style="margin:0 0 6px">The code stops working after 10 minutes.</p>
          <p style="margin:0">If you didn't ask to reset your password, nothing has changed on your account and you can ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendResetCode(toEmail, code, name) {
  const tx = getTransporter();
  if (!tx) throw new Error('Email delivery is not configured on the server.');

  await tx.sendMail({
    from: `"${BRAND}" <${EMAIL_FROM}>`,
    to: toEmail,
    subject: `${code} is your ${BRAND} reset code`,
    text: `Hi ${name || 'there'},\n\nYour ${BRAND} password reset code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: resetTemplate(code, name),
  });
}

module.exports = { sendResetCode, isMailConfigured };
