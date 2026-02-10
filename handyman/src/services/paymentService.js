const Stripe = require('stripe');
const {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  APP_BASE_URL,
  BOOKING_PRICE_USD,
} = require('../config');

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const BOOKING_AMOUNT_CENTS = BOOKING_PRICE_USD * 100;

async function createCheckoutSession(booking) {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: booking.email,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: BOOKING_AMOUNT_CENTS,
          product_data: {
            name: 'Full-day handyman visit (8h)',
            description: `Service on ${booking.service_date} at ${booking.arrival_time}`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      bookingId: booking.id,
      serviceDate: booking.service_date,
    },
    success_url: `${APP_BASE_URL}/?bookingId=${booking.id}`,
    cancel_url: `${APP_BASE_URL}/?bookingId=${booking.id}&cancelled=true`,
  });
}

function constructStripeEvent(signature, rawBody) {
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  createCheckoutSession,
  constructStripeEvent,
  BOOKING_AMOUNT_CENTS,
};

