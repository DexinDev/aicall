const path = require('path');
const express = require('express');
const cors = require('cors');
require('./db');

const { PORT } = require('./config');
const bookingRoutes = require('./routes/bookingRoutes');
const stripeWebhookRoutes = require('./routes/stripeWebhook');

const app = express();

app.use(cors());

app.use('/api', express.json(), bookingRoutes);
app.use(stripeWebhookRoutes);

const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

app.use((req, res, next) => {
  const isApiRequest = req.path.startsWith('/api') || req.path.startsWith('/webhooks');
  if (req.method === 'GET' && !isApiRequest) {
    return res.sendFile(path.join(publicDir, 'index.html'));
  }
  return next();
});

app.listen(PORT, () => {
  console.log(`Handyman booking server is running on port ${PORT}`);
});

