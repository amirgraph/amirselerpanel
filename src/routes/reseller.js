const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../models/database');
const { resellerAuth } = require('../middleware/auth');
const xui = require('../services/xuiService');
const { returnTrafficToReseller } = require('../services/syncService');

const router = express.Router();

// ─── Profile ─────────────────────────────────────────────────

router.get('/profile', resellerAuth, (req, res) => {
  const db = getDB();
  const reseller = db.prepare(`
    SELECT id, username, name, email, telegram_id, balance,
           traffic_limit_gb, traffic_used_gb, max_clients, current_clients,
           allowed_inbounds, brand_name, brand_logo, brand_color, brand_bg_color,
           sub_domain, is_active, created_at, expires_at
    FROM resellers WHERE id = ?
  `).get(req.user.id);
  res.json({ success: true, data: reseller });
});

// Update brand settings
router.put('/brand', resellerAuth, (req, res) => {
  const db = getDB();
  const { brand_name, brand_color, brand_bg_color, brand_logo } = req.body;
  db.prepare(`
    UPDATE resellers SET brand_name=?, brand_color=?, brand_bg_color=?, brand_logo=?
    WHERE id=?
  `).run(brand_name, brand_color, brand_bg_color, brand_logo || '', req.user.id);
  res.json({ success: true });
});

// ─── Inbounds (allowed) ───────────────────────────────────────

router.get('/inbounds', resellerAuth, (req, res) => {
  const db = getDB();
  const reseller = db.prepare('SELECT allowed_inbounds FROM resellers WHERE id=?').get(req.user.id);
  const allowed = JSON.parse(reseller.allowed_inbounds || '[]');
  
  const inbounds = db.prepare('SELECT * FROM inbounds_cache').all().map(ib => ({
    ...ib,
    data: JSON.parse(ib.data || '{}')
  }));

  const filtered = allowed.length > 0
    ? inbounds.filter(ib => allowed.includes(ib.id))
    : inbounds;

  res.json({ success: true, data: filtered });
});

// ─── Clients ─────────────────────────────────────────────────

router.get('/clients', resellerAuth, (req, res) => {
  const db = getDB();
  const clients = db.prepare(`
    SELECT * FROM clients WHERE reseller_id = ? ORDER BY created_at DESC
  `).all(req.user.id);
  res.json({ success: true, data: clients });
});

// Create client
router.post('/clients', resellerAuth, async (req, res) => {
  const db = getDB();
  const reseller = req.reseller;
  const {
    username, email, inbound_id,
    traffic_limit_gb = 10, ip_limit = 1,
    expires_at = null, telegram_id = null
  } = req.body;

  // Checks
  if (reseller.current_clients >= reseller.max_clients) {
    return res.status(400).json({ success: false, message: 'Client limit reached' });
  }
  const trafficAvailable = reseller.traffic_limit_gb - reseller.traffic_used_gb;
  if (traffic_limit_gb > trafficAvailable) {
    return res.status(400).json({ success: false, message: `Not enough traffic. Available: ${trafficAvailable.toFixed(2)} GB` });
  }

  // Check allowed inbound
  const allowed = JSON.parse(reseller.allowed_inbounds || '[]');
  if (allowed.length > 0 && !allowed.includes(parseInt(inbound_id))) {
    return res.status(400).json({ success: false, message: 'Inbound not allowed' });
  }

  const uuid = uuidv4();
  const clientEmail = `${reseller.username}_${username}`.toLowerCase().replace(/\s/g, '_');
  const expiryTime = expires_at ? new Date(expires_at).getTime() : 0;
  const trafficBytes = Math.round(traffic_limit_gb * 1024 ** 3);

  try {
    // Add to 3X-UI
    const result = await xui.addClient(parseInt(inbound_id), {
      id: uuid,
      email: clientEmail,
      enable: true,
      totalGB: trafficBytes,
      expiryTime: expiryTime,
      limitIp: ip_limit,
      flow: 'xtls-rprx-vision',
      tgId: telegram_id || '',
      subId: uuid.replace(/-/g, '').substring(0, 16),
    });

    if (!result?.success) {
      return res.status(500).json({ success: false, message: '3X-UI error: ' + JSON.stringify(result) });
    }

    // Save to DB
    db.prepare(`
      INSERT INTO clients (reseller_id, xui_uuid, xui_inbound_id, username, email,
        telegram_id, traffic_limit_gb, ip_limit, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(reseller.id, uuid, inbound_id, username, clientEmail,
      telegram_id, traffic_limit_gb, ip_limit, expires_at);

    // Update reseller counts
    db.prepare(`
      UPDATE resellers SET current_clients = current_clients + 1 WHERE id = ?
    `).run(reseller.id);

    // Charge wallet if price_per_gb set
    if (reseller.price_per_gb > 0) {
      const cost = traffic_limit_gb * reseller.price_per_gb;
      db.prepare('UPDATE resellers SET balance = balance - ? WHERE id = ?').run(cost, reseller.id);
      db.prepare(`
        INSERT INTO transactions (reseller_id, type, amount, description)
        VALUES (?, 'debit', ?, ?)
      `).run(reseller.id, cost, `Created client: ${username} (${traffic_limit_gb}GB)`);
    }

    res.json({ success: true, uuid, email: clientEmail });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Toggle client (enable/disable)
router.post('/clients/:id/toggle', resellerAuth, async (req, res) => {
  const db = getDB();
  const client = db.prepare('SELECT * FROM clients WHERE id=? AND reseller_id=?')
    .get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ success: false, message: 'Not found' });

  const newState = !client.is_active;
  try {
    await xui.toggleClient(client.xui_inbound_id, client.xui_uuid, newState);
    db.prepare('UPDATE clients SET is_active=? WHERE id=?').run(newState ? 1 : 0, client.id);
    res.json({ success: true, is_active: newState });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete client (returns unused traffic)
router.delete('/clients/:id', resellerAuth, async (req, res) => {
  const db = getDB();
  const client = db.prepare('SELECT * FROM clients WHERE id=? AND reseller_id=?')
    .get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ success: false, message: 'Not found' });

  try {
    await xui.deleteClient(client.xui_inbound_id, client.xui_uuid);
    db.prepare('DELETE FROM clients WHERE id=?').run(client.id);

    // Return unused traffic to reseller
    returnTrafficToReseller(req.user.id, client.traffic_used_gb, client.traffic_limit_gb);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update client (traffic, ip_limit, expiry)
router.put('/clients/:id', resellerAuth, async (req, res) => {
  const db = getDB();
  const client = db.prepare('SELECT * FROM clients WHERE id=? AND reseller_id=?')
    .get(req.params.id, req.user.id);
  if (!client) return res.status(404).json({ success: false, message: 'Not found' });

  const { traffic_limit_gb, ip_limit, expires_at } = req.body;
  const reseller = req.reseller;

  try {
    const expiryTime = expires_at ? new Date(expires_at).getTime() : 0;
    const trafficBytes = Math.round((traffic_limit_gb || client.traffic_limit_gb) * 1024 ** 3);

    await xui.updateClient(client.xui_inbound_id, client.xui_uuid, {
      id: client.xui_uuid,
      email: client.email,
      enable: !!client.is_active,
      totalGB: trafficBytes,
      expiryTime,
      limitIp: ip_limit || client.ip_limit,
      flow: 'xtls-rprx-vision',
    });

    db.prepare(`
      UPDATE clients SET traffic_limit_gb=?, ip_limit=?, expires_at=? WHERE id=?
    `).run(
      traffic_limit_gb || client.traffic_limit_gb,
      ip_limit || client.ip_limit,
      expires_at || client.expires_at,
      client.id
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Transactions ────────────────────────────────────────────

router.get('/transactions', resellerAuth, (req, res) => {
  const db = getDB();
  const txns = db.prepare(`
    SELECT * FROM transactions WHERE reseller_id=? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);
  res.json({ success: true, data: txns });
});

// ─── Stats ───────────────────────────────────────────────────

router.get('/stats', resellerAuth, (req, res) => {
  const db = getDB();
  const reseller = db.prepare('SELECT * FROM resellers WHERE id=?').get(req.user.id);
  const activeClients = db.prepare('SELECT COUNT(*) as c FROM clients WHERE reseller_id=? AND is_active=1').get(req.user.id).c;
  const expiringSoon = db.prepare(`
    SELECT COUNT(*) as c FROM clients 
    WHERE reseller_id=? AND expires_at BETWEEN CURRENT_TIMESTAMP AND datetime('now', '+3 days')
  `).get(req.user.id).c;

  res.json({
    success: true,
    data: {
      balance: reseller.balance,
      traffic_limit_gb: reseller.traffic_limit_gb,
      traffic_used_gb: reseller.traffic_used_gb,
      traffic_remaining_gb: Math.max(0, reseller.traffic_limit_gb - reseller.traffic_used_gb),
      max_clients: reseller.max_clients,
      current_clients: reseller.current_clients,
      active_clients: activeClients,
      expiring_soon: expiringSoon,
    }
  });
});

module.exports = router;
