const express = require('express');
const { getDB } = require('../models/database');

const router = express.Router();
const SUB_BASE = process.env.SUB_BASE_URL || 'http://localhost:3000/sub';

// Generate VLESS sub-link for a client
router.get('/:uuid', (req, res) => {
  const db = getDB();
  const { uuid } = req.params;

  const client = db.prepare('SELECT * FROM clients WHERE xui_uuid=?').get(uuid);
  if (!client || !client.is_active) {
    return res.status(404).send('Not found or disabled');
  }

  const reseller = db.prepare('SELECT * FROM resellers WHERE id=?').get(client.reseller_id);

  // Get inbound info
  const inbound = db.prepare('SELECT * FROM inbounds_cache WHERE id=?').get(client.xui_inbound_id);
  if (!inbound) return res.status(404).send('Inbound not found');

  const inboundData = JSON.parse(inbound.data || '{}');
  const serverIP = process.env.XUI_URL?.replace('https://', '').replace('http://', '').split(':')[0];

  // Build VLESS link
  const streamSettings = JSON.parse(inboundData.streamSettings || '{}');
  const network = streamSettings.network || 'tcp';
  const security = streamSettings.security || 'none';

  let params = `type=${network}&security=${security}`;

  if (security === 'reality') {
    const realitySettings = streamSettings.realitySettings || {};
    const publicKey = realitySettings.settings?.publicKey || '';
    const shortId = realitySettings.shortIds?.[0] || '';
    const serverName = realitySettings.serverNames?.[0] || '';
    const spiderX = realitySettings.settings?.spiderX || '/';
    params += `&pbk=${publicKey}&sid=${shortId}&sni=${serverName}&spx=${encodeURIComponent(spiderX)}&flow=xtls-rprx-vision&fp=chrome`;
  } else if (security === 'tls') {
    const tlsSettings = streamSettings.tlsSettings || {};
    params += `&sni=${tlsSettings.serverName || serverIP}`;
  }

  if (network === 'ws') {
    const wsSettings = streamSettings.wsSettings || {};
    params += `&path=${encodeURIComponent(wsSettings.path || '/')}&host=${wsSettings.host || serverIP}`;
  } else if (network === 'grpc') {
    const grpcSettings = streamSettings.grpcSettings || {};
    params += `&serviceName=${grpcSettings.serviceName || ''}`;
  }

  const brandName = reseller?.brand_name || 'VPN Service';
  const vlessLink = `vless://${uuid}@${serverIP}:${inbound.port}?${params}#${encodeURIComponent(brandName)}`;

  // Return as plain text subscription
  const subContent = Buffer.from(vlessLink).toString('base64');
  
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Profile-Title', Buffer.from(brandName).toString('base64'));
  res.setHeader('Subscription-Userinfo', 
    `upload=0; download=${Math.round(client.traffic_used_gb * 1024**3)}; total=${Math.round(client.traffic_limit_gb * 1024**3)}; expire=${client.expires_at ? Math.floor(new Date(client.expires_at).getTime()/1000) : 0}`
  );
  res.send(subContent);
});

// Get sub info (for reseller panel)
router.get('/:uuid/info', (req, res) => {
  const db = getDB();
  const client = db.prepare('SELECT * FROM clients WHERE xui_uuid=?').get(req.params.uuid);
  if (!client) return res.status(404).json({ success: false });
  
  res.json({
    success: true,
    sub_url: `${SUB_BASE}/${client.xui_uuid}`,
    traffic_used_gb: client.traffic_used_gb,
    traffic_limit_gb: client.traffic_limit_gb,
    expires_at: client.expires_at,
    is_active: client.is_active,
  });
});

module.exports = router;
