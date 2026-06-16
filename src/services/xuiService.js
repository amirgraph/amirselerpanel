const axios = require('axios');
const https = require('https');

const XUI_URL = process.env.XUI_URL;
const XUI_PATH = process.env.XUI_PATH || '';
const XUI_USERNAME = process.env.XUI_USERNAME;
const XUI_PASSWORD = process.env.XUI_PASSWORD;

// Ignore self-signed certs
const agent = new https.Agent({ rejectUnauthorized: false });

let sessionCookie = null;
let lastLogin = null;

const xuiAxios = axios.create({
  baseURL: XUI_URL + XUI_PATH,
  httpsAgent: agent,
  timeout: 15000,
});

// Login and get session
async function login() {
  try {
    const res = await xuiAxios.post('/login', {
      username: XUI_USERNAME,
      password: XUI_PASSWORD,
    });

    if (res.data?.success) {
      const cookies = res.headers['set-cookie'];
      if (cookies) {
        sessionCookie = cookies.map(c => c.split(';')[0]).join('; ');
        lastLogin = Date.now();
        return true;
      }
    }
    return false;
  } catch (err) {
    console.error('XUI Login error:', err.message);
    return false;
  }
}

// Auto re-login if session expired (30min)
async function ensureLogin() {
  if (!sessionCookie || !lastLogin || Date.now() - lastLogin > 28 * 60 * 1000) {
    await login();
  }
}

async function xuiRequest(method, endpoint, data = null) {
  await ensureLogin();
  try {
    const config = {
      method,
      url: endpoint,
      headers: { Cookie: sessionCookie },
    };
    if (data) config.data = data;
    const res = await xuiAxios(config);
    return res.data;
  } catch (err) {
    // Try re-login once
    if (err.response?.status === 401 || err.response?.status === 403) {
      await login();
      const config = {
        method,
        url: endpoint,
        headers: { Cookie: sessionCookie },
      };
      if (data) config.data = data;
      const res = await xuiAxios(config);
      return res.data;
    }
    throw err;
  }
}

// ─── Inbounds ───────────────────────────────────────────────
async function getInbounds() {
  const res = await xuiRequest('GET', '/panel/api/inbounds/list');
  return res?.obj || [];
}

async function getInbound(id) {
  const res = await xuiRequest('GET', `/panel/api/inbounds/get/${id}`);
  return res?.obj || null;
}

// ─── Clients ────────────────────────────────────────────────
async function addClient(inboundId, clientData) {
  const res = await xuiRequest('POST', '/panel/api/inbounds/addClient', {
    id: inboundId,
    settings: JSON.stringify({
      clients: [clientData]
    })
  });
  return res;
}

async function updateClient(inboundId, uuid, clientData) {
  const res = await xuiRequest('POST', `/panel/api/inbounds/updateClient/${uuid}`, {
    id: inboundId,
    settings: JSON.stringify({
      clients: [clientData]
    })
  });
  return res;
}

async function deleteClient(inboundId, uuid) {
  const res = await xuiRequest('POST', `/panel/api/inbounds/${inboundId}/delClient/${uuid}`);
  return res;
}

async function getClientTraffic(email) {
  const res = await xuiRequest('GET', `/panel/api/inbounds/getClientTraffics/${email}`);
  return res?.obj || null;
}

async function resetClientTraffic(inboundId, email) {
  const res = await xuiRequest('POST', `/panel/api/inbounds/${inboundId}/resetClientTraffic/${email}`);
  return res;
}

async function toggleClient(inboundId, uuid, enable) {
  // Get current client data first
  const inbound = await getInbound(inboundId);
  if (!inbound) return { success: false };
  
  const settings = JSON.parse(inbound.settings || '{}');
  const clients = settings.clients || [];
  const client = clients.find(c => c.id === uuid);
  if (!client) return { success: false };

  client.enable = enable;
  
  const res = await xuiRequest('POST', `/panel/api/inbounds/updateClient/${uuid}`, {
    id: inboundId,
    settings: JSON.stringify({ clients: [client] })
  });
  return res;
}

// Get all clients traffic stats
async function getAllClientStats() {
  const inbounds = await getInbounds();
  const stats = {};
  
  for (const inbound of inbounds) {
    const clientStats = inbound.clientStats || [];
    for (const stat of clientStats) {
      stats[stat.email] = {
        up: stat.up || 0,
        down: stat.down || 0,
        total: (stat.up || 0) + (stat.down || 0),
        enable: stat.enable,
        expiryTime: stat.expiryTime,
      };
    }
  }
  return stats;
}

module.exports = {
  login,
  getInbounds,
  getInbound,
  addClient,
  updateClient,
  deleteClient,
  getClientTraffic,
  resetClientTraffic,
  toggleClient,
  getAllClientStats,
};
