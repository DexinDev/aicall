const db = require('../db');

const insertBookingStmt = db.prepare(`
  INSERT INTO bookings (
    id,
    service_date,
    arrival_time,
    first_name,
    last_name,
    address,
    phone,
    email,
    description,
    status,
    stripe_session_id,
    amount_cents
  ) VALUES (
    @id,
    @service_date,
    @arrival_time,
    @first_name,
    @last_name,
    @address,
    @phone,
    @email,
    @description,
    @status,
    @stripe_session_id,
    @amount_cents
  )
`);

const updateStatusStmt = db.prepare(`
  UPDATE bookings
  SET status = @status,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const updateSessionStmt = db.prepare(`
  UPDATE bookings
  SET stripe_session_id = @stripe_session_id,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = @id
`);

const findByIdStmt = db.prepare(`
  SELECT *
  FROM bookings
  WHERE id = ?
`);

function createBooking(payload) {
  insertBookingStmt.run(payload);
  return findBookingById(payload.id);
}

function updateBookingStatus(id, status) {
  updateStatusStmt.run({ id, status });
  return findBookingById(id);
}

function updateBookingSession(id, stripeSessionId) {
  updateSessionStmt.run({ id, stripe_session_id: stripeSessionId });
  return findBookingById(id);
}

function findBookingById(id) {
  return findByIdStmt.get(id);
}

module.exports = {
  createBooking,
  updateBookingStatus,
  updateBookingSession,
  findBookingById,
};

