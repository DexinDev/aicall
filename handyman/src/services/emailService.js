const nodemailer = require('nodemailer');
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = require('../config');

function ensureEmailConfigured() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    const missing = [];
    if (!SMTP_HOST) missing.push('SMTP_HOST');
    if (!SMTP_USER) missing.push('SMTP_USER');
    if (!SMTP_PASS) missing.push('SMTP_PASS');
    throw new Error(`SMTP credentials are not configured. Missing: ${missing.join(', ')}`);
  }
}

function createTransport() {
  ensureEmailConfigured();
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
}

function formatBookingDetails(booking) {
  return `
    <p>Hi ${booking.first_name},</p>
    <p>Your handyman visit has been scheduled. Here are the details:</p>
    <ul>
      <li><strong>Date:</strong> ${booking.service_date}</li>
      <li><strong>Arrival:</strong> ${booking.arrival_time}</li>
      <li><strong>Address:</strong> ${booking.address}</li>
      <li><strong>Description:</strong> ${booking.description || 'N/A'}</li>
      <li><strong>Total:</strong> $${(booking.amount_cents / 100).toFixed(2)}</li>
      <li><strong>Status:</strong> ${booking.status}</li>
    </ul>
    <p>We will see you soon!</p>
  `;
}

async function sendBookingConfirmation(booking) {
  console.log(`[Email] Attempting to send confirmation to ${booking.email}`);
  const transport = createTransport();
  const result = await transport.sendMail({
    from: SMTP_FROM,
    to: booking.email,
    subject: 'Handyman booking confirmed',
    html: formatBookingDetails(booking),
  });
  console.log(`[Email] Successfully sent confirmation to ${booking.email}. MessageId: ${result.messageId}`);
  return result;
}

module.exports = {
  sendBookingConfirmation,
};

