const { randomUUID } = require('crypto');
const {
  BOOKING_PRICE_USD,
} = require('../config');
const {
  createBooking,
  updateBookingStatus,
  updateBookingSession,
  findBookingById,
} = require('../repositories/bookingRepository');
const {
  createCheckoutSession,
  BOOKING_AMOUNT_CENTS,
} = require('./paymentService');
const { sendBookingConfirmation } = require('./emailService');
const { sendTelegramNotification } = require('./telegramService');

const ARRIVAL_SLOTS = ['8:00 AM', '9:00 AM', '10:00 AM'];

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getAvailableDates() {
  const dates = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // start from day after tomorrow (today + 3 days)
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 3);
  
  // Generate dates for a year ahead
  const endDate = new Date(today);
  endDate.setFullYear(today.getFullYear() + 1);
  
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(formatDate(new Date(currentDate)));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
}

function getArrivalSlots() {
  return ARRIVAL_SLOTS;
}

function validatePayload(payload) {
  const requiredFields = [
    'serviceDate',
    'arrivalTime',
    'fullName',
    'address',
    'phone',
    'email',
  ];
  requiredFields.forEach((field) => {
    if (!payload[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  });

  // Validate date format and ensure it's not in the past or within blocked period
  const selectedDate = new Date(payload.serviceDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);
  dayAfterTomorrow.setHours(23, 59, 59, 999);
  
  if (isNaN(selectedDate.getTime())) {
    throw new Error('Invalid date format');
  }
  
  if (selectedDate < dayAfterTomorrow) {
    throw new Error('Selected date must be at least 3 days from today');
  }

  if (!ARRIVAL_SLOTS.includes(payload.arrivalTime)) {
    throw new Error('Selected time slot is not available');
  }
}

async function initiateBooking(payload) {
  validatePayload(payload);

  const bookingRecord = {
    id: randomUUID(),
    service_date: payload.serviceDate,
    arrival_time: payload.arrivalTime,
    first_name: payload.fullName.trim(),
    last_name: '', // Keep for backward compatibility, but not used
    address: payload.address.trim(),
    phone: payload.phone.trim(),
    email: payload.email.trim().toLowerCase(),
    description: payload.description?.trim() || '',
    status: 'pending',
    stripe_session_id: null,
    amount_cents: BOOKING_AMOUNT_CENTS,
  };

  createBooking(bookingRecord);

  const checkoutSession = await createCheckoutSession(bookingRecord);

  updateBookingSession(bookingRecord.id, checkoutSession.id);

  return {
    bookingId: bookingRecord.id,
    checkoutUrl: checkoutSession.url,
  };
}

function getBookingById(id) {
  return findBookingById(id);
}

function markBookingPaid(bookingId) {
  const booking = updateBookingStatus(bookingId, 'paid');
  if (!booking) {
    throw new Error('Booking not found');
  }
  return booking;
}

async function notifyFulfilledBooking(booking) {
  const notificationErrors = [];
  try {
    await sendBookingConfirmation(booking);
  } catch (error) {
    notificationErrors.push(`email: ${error.message}`);
  }

  try {
    await sendTelegramNotification(booking);
  } catch (error) {
    notificationErrors.push(`telegram: ${error.message}`);
  }

  if (notificationErrors.length) {
    throw new Error(notificationErrors.join(' | '));
  }
}

module.exports = {
  getAvailableDates,
  getArrivalSlots,
  initiateBooking,
  getBookingById,
  markBookingPaid,
  notifyFulfilledBooking,
  BOOKING_PRICE_USD,
};

