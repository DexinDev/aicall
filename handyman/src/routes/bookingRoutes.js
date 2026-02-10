const express = require('express');
const {
  getAvailableDates,
  getArrivalSlots,
  initiateBooking,
  getBookingById,
} = require('../services/bookingService');

const router = express.Router();

router.get('/availability/dates', (_req, res) => {
  res.json({ dates: getAvailableDates() });
});

router.get('/availability/slots', (_req, res) => {
  res.json({ slots: getArrivalSlots() });
});

router.get('/bookings/:id', (req, res) => {
  const booking = getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  return res.json({ booking });
});

router.post('/bookings', async (req, res) => {
  try {
    const { bookingId, checkoutUrl } = await initiateBooking(req.body);
    return res.status(201).json({ bookingId, checkoutUrl });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

module.exports = router;

