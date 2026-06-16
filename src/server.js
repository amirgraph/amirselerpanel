require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');

const { initDB } = require('./models/database');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const resellerRoutes = require('./routes/reseller');
const subRoutes = require('./routes/sub');
const { syncUsersJob } = require('./services/syncService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reseller', resellerRoutes);
app.use('/sub', subRoutes);

// Admin Panel
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin/index.html'));
});

// Reseller Panel
app.get('/panel*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/reseller/index.html'));
});

// Root
app.get('/', (req, res) => {
  res.redirect('/panel');
});

// Init DB and start
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`✅ XUI Reseller Panel running on port ${PORT}`);
    console.log(`📊 Admin: http://localhost:${PORT}/admin`);
    console.log(`🏪 Reseller: http://localhost:${PORT}/panel`);
  });

  // Sync usage every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    syncUsersJob();
  });

  // Check expired accounts every hour
  cron.schedule('0 * * * *', () => {
    const { checkExpiredAccounts } = require('./services/syncService');
    checkExpiredAccounts();
  });
});
