const express = require('express');
const { constructStripeEvent } = require('../services/paymentService');
const {
  markBookingPaid,
  notifyFulfilledBooking,
} = require('../services/bookingService');

const router = express.Router();

router.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];
    let event;

    try {
      event = constructStripeEvent(signature, req.body);
      console.log(`[Webhook] Received event: ${event.type}`);
    } catch (error) {
      console.error(`[Webhook] Error: ${error.message}`);
      return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const bookingId = event.data.object.metadata?.bookingId;
      console.log(`[Webhook] Processing checkout.session.completed for booking: ${bookingId}`);
      
      if (bookingId) {
        try {
          const booking = markBookingPaid(bookingId);
          console.log(`[Webhook] Booking ${bookingId} marked as paid. Sending notifications...`);
          
          await notifyFulfilledBooking(booking);
          console.log(`[Webhook] Successfully sent notifications for booking ${bookingId}`);
        } catch (err) {
          console.error(`[Webhook] Failed to finalize booking ${bookingId}:`, err.message);
          console.error(err.stack);
        }
      } else {
        console.warn('[Webhook] checkout.session.completed event missing bookingId in metadata');
      }
    }

    return res.json({ received: true });
  }
);

module.exports = router;

