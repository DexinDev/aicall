# Handyman day-booking flow

Embedded flow for booking an on-site handyman for a full 8-hour day. Designed to drop into any landing page via an `<iframe>` with a Calendly-inspired UI. The backend handles booking storage, Stripe Checkout, SMTP confirmations, and Telegram alerts.

## Tech stack

- Node.js + Express for the API and static hosting
- SQLite (via `better-sqlite3`) for persistent booking storage
- Stripe Checkout for the fixed $800 payment
- Nodemailer over SMTP for customer emails
- Telegram Bot API for internal alerts
- Vanilla HTML/CSS/JS frontend (no build step) served from `public/`

## Project structure

```
├── env.example                 # Copy to .env and fill in secrets
├── public/                     # Embeddable UI
│   ├── index.html              # Multi-step flow container
│   ├── styles.css              # Calendly-inspired styling
│   └── app.js                  # UI logic (dates → time → form → confirmation)
├── src/
│   ├── config/                 # Environment + constants
│   ├── db/                     # SQLite connection + schema bootstrap
│   ├── repositories/           # Booking persistence helpers
│   ├── routes/                 # Express routers (API + Stripe webhook)
│   ├── services/               # Booking, payment, email, Telegram orchestration
│   └── server.js               # Express app entry point
├── data/                       # SQLite database lives here (handyman.db)
├── package.json
└── README.md
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp env.example .env
   ```

   Fill in:

   - `APP_BASE_URL` – public URL that Stripe should redirect back to (e.g. `https://your-domain.com/handyman-widget`)
   - `STRIPE_SECRET_KEY` – secret key for the production/test mode you are using
   - `STRIPE_WEBHOOK_SECRET` – from `stripe listen` or Stripe dashboard
   - SMTP settings for the sender mailbox
   - `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` of the ops channel

3. **Run the server**

   ```bash
   npm run dev
   ```

   The UI and API are served on `http://localhost:3000`. Embed that URL in an `<iframe>` on your landing page (adjust size to ~720 px width).

## Stripe webhook (required)

Payments are confirmed via Stripe Checkout webhooks. Start a webhook tunnel during development:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

Take the signing secret from the command output and drop it into `.env` as `STRIPE_WEBHOOK_SECRET`. In production, point the webhook endpoint to `https://your-domain.com/webhooks/stripe`.

## SMTP + Telegram notifications

On successful payment, the webhook handler:

1. Marks the booking as `paid` in SQLite.
2. Sends a detailed email to the customer (via Nodemailer + SMTP).
3. Posts a summary into the configured Telegram channel.

If either notification fails, the booking still stays `paid` and the error is logged to the server console for follow-up.

## Data storage

- SQLite database file lives at `data/handyman.db` by default. Override with `DATABASE_PATH` if you prefer another location (e.g. mounted volume).
- Each booking is stored with all submitted customer details, Stripe session ID, and status timestamps.

## Deployment notes

- Set `APP_BASE_URL` to the production origin where the widget is hosted so Stripe can redirect customers back to the confirmation screen.
- Serve the app behind HTTPS (Stripe requires https URLs in live mode).
- Ensure the server process can write to the `data/` directory (or your custom `DATABASE_PATH`).
- Keep `.env` secrets out of version control; only `env.example` lives in the repo.

## Available npm scripts

- `npm run dev` – start Express in development mode.
- `npm start` – production start (same command without extra logging).

That’s it—drop `http://<host>:3000` into an iframe and you have an end-to-end handyman booking funnel with payments, email receipts, and internal alerts.

