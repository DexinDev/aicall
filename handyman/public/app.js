const appEl = document.querySelector('#app');

const state = {
  dates: [],
  slots: [],
  step: 'loading',
  selectedDate: null,
  selectedTime: null,
  isSubmitting: false,
  error: '',
  confirmation: null,
  cancelled: false,
};

const formatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'Request failed');
  }
  return response.json();
}

function render() {
  if (state.step === 'loading') {
    appEl.innerHTML = `<p class="notice">Loading availability...</p>`;
    return;
  }

  if (state.step === 'error') {
    appEl.innerHTML = `<p class="notice">${state.error}</p>`;
    return;
  }

  if (state.step === 'confirmation' && state.confirmation) {
    renderConfirmation();
    return;
  }

  if (state.step === 'dates') {
    renderDateSelection();
    return;
  }

  if (state.step === 'time') {
    renderTimeSelection();
    return;
  }

  if (state.step === 'form') {
    renderForm();
  }
}

function renderErrorMessage() {
  if (!state.error) return '';
  return `<p class="notice" role="alert">${state.error}</p>`;
}

function renderDateSelection() {
  appEl.innerHTML = `
    <section>
      <h2 class="step-title">Select an available day</h2>
      ${renderErrorMessage()}
      <div id="calendar-container"></div>
    </section>
  `;

  // Проверяем, что Flatpickr загружен
  if (typeof flatpickr === 'undefined') {
    appEl.innerHTML = `
      <section>
        <h2 class="step-title">Select an available day</h2>
        ${renderErrorMessage()}
        <p class="notice">Loading calendar...</p>
      </section>
    `;
    // Повторяем попытку через небольшую задержку
    setTimeout(() => {
      if (typeof flatpickr !== 'undefined') {
        renderDateSelection();
      }
    }, 100);
    return;
  }

  // Вычисляем даты для блокировки
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];
  
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(today.getDate() + 2);
  const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];

  // Минимальная дата для отображения (сегодня + 3 дня)
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + 3);

  // Максимальная дата - год вперед
  const maxDate = new Date(today);
  maxDate.setFullYear(today.getFullYear() + 1);

  // Создаем календарь
  const calendar = flatpickr('#calendar-container', {
    inline: true,
    dateFormat: 'Y-m-d',
    minDate: minDate,
    maxDate: maxDate,
    disable: [
      function (date) {
        // Отключаем прошедшие дни, сегодня, завтра и послезавтра
        const dateStr = date.toISOString().split('T')[0];
        const dateObj = new Date(dateStr);
        dateObj.setHours(0, 0, 0, 0);
        
        // Прошедшие дни
        if (dateObj < today) {
          return true;
        }
        
        // Сегодня, завтра и послезавтра - всегда неактивны
        if (
          dateStr === todayStr ||
          dateStr === tomorrowStr ||
          dateStr === dayAfterTomorrowStr
        ) {
          return true;
        }
        
        // Все остальные дни доступны для выбора
        return false;
      },
    ],
    onChange: function (selectedDates, dateStr) {
      if (dateStr) {
        state.selectedDate = dateStr;
        state.step = 'time';
        state.error = '';
        render();
      }
    },
  });
}

function renderTimeSelection() {
  const cards = state.slots
    .map(
      (slot) => `
        <button class="card" data-slot="${slot}">
          <strong>${slot}</strong>
          <p class="subtle">Arrival window</p>
        </button>
      `
    )
    .join('');

  appEl.innerHTML = `
    <section>
      <div class="notice">Selected date: ${formatter.format(
        new Date(`${state.selectedDate}T00:00:00`)
      )}</div>
      <h2 class="step-title">When should we arrive?</h2>
      ${renderErrorMessage()}
      <div class="grid">${cards}</div>
      <button class="ghost" id="back-to-dates">Back</button>
    </section>
  `;

  appEl.querySelectorAll('.card').forEach((card) => {
    card.addEventListener('click', () => {
      state.selectedTime = card.dataset.slot;
      state.step = 'form';
      state.error = '';
      render();
    });
  });

  const backBtn = appEl.querySelector('#back-to-dates');
  backBtn.addEventListener('click', () => {
    state.step = 'dates';
    render();
  });
}

function formTemplate() {
  return `
    <form id="booking-form">
      ${renderErrorMessage()}
      <div class="notice">
        Visit scheduled for <strong>${formatter.format(
          new Date(`${state.selectedDate}T00:00:00`)
        )}</strong> at <strong>${state.selectedTime}</strong>
      </div>
      <label>
        Your Full Name *
        <input name="fullName" required placeholder="Enter your full name" />
      </label>
      <label>
        Address *
        <input name="address" required placeholder="Street, City, State" />
      </label>
      <label>
        Phone *
        <input name="phone" required placeholder="+1 (555) 123-4567" />
      </label>
      <label>
        Email *
        <input type="email" name="email" required placeholder="your@email.com" />
      </label>
      <label>
        Describe the job
        <textarea name="description" placeholder="Repairs, installs, etc."></textarea>
      </label>
      <button type="submit" ${state.isSubmitting ? 'disabled' : ''}>
        ${state.isSubmitting ? 'Creating booking...' : 'Send A Request'}
      </button>
      <button type="button" class="ghost" id="back-to-time">Back</button>
    </form>
  `;
}

function renderForm() {
  appEl.innerHTML = `
    <section class="form-section">
      <div>
        <h2 class="step-title">Tell us where to be</h2>
      </div>
      <div>
        <p class="form-intro">We will not just make it beautiful and comfortable - we will make it for you. Hurry to sign up: there are only 2 spots left for October!</p>
        ${formTemplate()}
        <p class="legal-text">By submitting personal information, you agree to our <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a></p>
      </div>
    </section>
  `;

  appEl.querySelector('#booking-form').addEventListener('submit', submitForm);
  appEl.querySelector('#back-to-time').addEventListener('click', () => {
    state.step = 'time';
    render();
  });
}

async function submitForm(event) {
  event.preventDefault();
  state.isSubmitting = true;
  state.error = '';
  render();

  const formData = new FormData(event.target);
  const payload = Object.fromEntries(formData.entries());
  payload.serviceDate = state.selectedDate;
  payload.arrivalTime = state.selectedTime;

  try {
    const response = await fetchJSON('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    window.location.href = response.checkoutUrl;
  } catch (error) {
    state.error = error.message;
    state.isSubmitting = false;
    render();
  }
}

function renderConfirmation() {
  const booking = state.confirmation;
  const rows = [
    ['Date', formatter.format(new Date(`${booking.service_date}T00:00:00`))],
    ['Arrival', booking.arrival_time],
    ['Client', booking.first_name + (booking.last_name ? ' ' + booking.last_name : '')],
    ['Address', booking.address],
    ['Phone', booking.phone],
    ['Email', booking.email],
    ['Status', booking.status],
    ['Amount', `$${(booking.amount_cents / 100).toFixed(2)}`],
  ]
    .map(
      ([label, value]) => `
      <div class="summary-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `
    )
    .join('');

  const message = state.cancelled
    ? 'Payment was cancelled. You can close this window and try again from the landing page.'
    : 'We received your booking. Expect your handyman on the selected date.';

  appEl.innerHTML = `
    <section>
      <div class="notice success">
        <strong>Booking created!</strong><br />
        ${message}
      </div>
      <div class="summary-card">
        <h3>Order details</h3>
        ${rows}
        ${
          booking.description
            ? `<p><strong>Task:</strong> ${booking.description}</p>`
            : ''
        }
      </div>
    </section>
  `;
}

async function init() {
  try {
    const [datesData, slotsData] = await Promise.all([
      fetchJSON('/api/availability/dates'),
      fetchJSON('/api/availability/slots'),
    ]);
    state.dates = datesData.dates;
    state.slots = slotsData.slots;
  } catch (error) {
    state.error = error.message;
    state.step = 'error';
    render();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const bookingId = params.get('bookingId');
  state.cancelled = params.get('cancelled') === 'true';

  if (bookingId) {
    try {
      const { booking } = await fetchJSON(`/api/bookings/${bookingId}`);
      state.confirmation = booking;
      state.step = 'confirmation';
    } catch (error) {
      state.error = error.message;
      state.step = 'error';
    } finally {
      render();
    }
    return;
  }

  state.step = 'dates';
  render();
}

init();

