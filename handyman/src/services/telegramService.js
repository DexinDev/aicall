const fetch = require('node-fetch');
const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = require('../config');

function ensureTelegramConfigured() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Telegram is not configured');
  }
}

function assembleMessage(booking) {
  return [
    '🛠 New handyman booking',
    `Date: ${booking.service_date}`,
    `Arrival: ${booking.arrival_time}`,
    `Client: ${booking.first_name}${booking.last_name ? ' ' + booking.last_name : ''}`,
    `Address: ${booking.address}`,
    `Phone: ${booking.phone}`,
    `Email: ${booking.email}`,
    `Status: ${booking.status}`,
    `Amount: $${(booking.amount_cents / 100).toFixed(2)}`,
    `Details: ${booking.description || 'N/A'}`,
  ].join('\n');
}

async function sendTelegramNotification(booking) {
  ensureTelegramConfigured();
  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: assembleMessage(booking),
    parse_mode: 'Markdown',
  };

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${errorText}`);
  }
}

module.exports = {
  sendTelegramNotification,
};

