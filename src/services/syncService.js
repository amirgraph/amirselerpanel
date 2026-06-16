const { getDB } = require('../models/database');
const xui = require('./xuiService');

// Main sync: pull real usage from 3X-UI and update DB
async function syncUsersJob() {
  const db = getDB();
  try {
    const allStats = await xui.getAllClientStats();
    const clients = db.prepare('SELECT * FROM clients WHERE is_active = 1').all();

    const updateClient = db.prepare(`
      UPDATE clients SET traffic_used_gb = ?, last_sync = CURRENT_TIMESTAMP WHERE id = ?
    `);

    const deactivateClient = db.prepare(`
      UPDATE clients SET is_active = 0 WHERE id = ?
    `);

    // Update reseller used traffic
    const resellerTraffic = {};

    for (const client of clients) {
      const stat = allStats[client.email] || allStats[`${client.xui_uuid}`];
      if (!stat) continue;

      const usedGb = stat.total / (1024 ** 3);
      const prevUsed = client.traffic_used_gb || 0;
      const diff = Math.max(0, usedGb - prevUsed);

      updateClient.run(usedGb, client.id);

      // Track per-reseller usage delta
      if (!resellerTraffic[client.reseller_id]) resellerTraffic[client.reseller_id] = 0;
      resellerTraffic[client.reseller_id] += diff;

      // Auto-disable if over limit
      if (client.traffic_limit_gb > 0 && usedGb >= client.traffic_limit_gb) {
        await xui.toggleClient(client.xui_inbound_id, client.xui_uuid, false);
        deactivateClient.run(client.id);
      }
    }

    // Update reseller traffic used
    const updateResellerTraffic = db.prepare(`
      UPDATE resellers SET traffic_used_gb = traffic_used_gb + ? WHERE id = ?
    `);
    for (const [resellerId, delta] of Object.entries(resellerTraffic)) {
      if (delta > 0) updateResellerTraffic.run(delta, resellerId);
    }

  } catch (err) {
    console.error('Sync error:', err.message);
  }
}

// Check and disable expired accounts
async function checkExpiredAccounts() {
  const db = getDB();
  try {
    const expired = db.prepare(`
      SELECT * FROM clients 
      WHERE is_active = 1 
      AND expires_at IS NOT NULL 
      AND expires_at < CURRENT_TIMESTAMP
    `).all();

    for (const client of expired) {
      await xui.toggleClient(client.xui_inbound_id, client.xui_uuid, false);
      db.prepare('UPDATE clients SET is_active = 0 WHERE id = ?').run(client.id);
    }

    if (expired.length > 0) {
      console.log(`⏰ Disabled ${expired.length} expired accounts`);
    }
  } catch (err) {
    console.error('Expiry check error:', err.message);
  }
}

// When a client is deleted: return traffic to reseller
function returnTrafficToReseller(resellerId, trafficUsedGb, trafficLimitGb) {
  const db = getDB();
  // Return unused traffic only
  const remaining = Math.max(0, trafficLimitGb - trafficUsedGb);
  db.prepare(`
    UPDATE resellers SET 
      traffic_used_gb = MAX(0, traffic_used_gb - ?),
      current_clients = MAX(0, current_clients - 1)
    WHERE id = ?
  `).run(remaining, resellerId);
}

module.exports = { syncUsersJob, checkExpiredAccounts, returnTrafficToReseller };
