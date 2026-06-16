const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../models/database');
const { generateToken, adminAuth } = require('../middleware/auth');

const router = express.Router();

// Admin login
router.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const db = getDB();
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = generateToken({ id: admin.id, username: admin.username, role: 'admin' });
    res.json({ success: true, token, username: admin.username });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reseller login
router.post('/reseller/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const db = getDB();
    const reseller = db.prepare('SELECT * FROM resellers WHERE username = ?').get(username);
    if (!reseller || !bcrypt.compareSync(password, reseller.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (!reseller.is_active) {
      return res.status(403).json({ success: false, message: 'Account disabled' });
    }
    const token = generateToken({ id: reseller.id, username: reseller.username, role: 'reseller' });
    res.json({
      success: true, token,
      reseller: {
        id: reseller.id,
        username: reseller.username,
        name: reseller.name,
        brand_name: reseller.brand_name,
        brand_color: reseller.brand_color,
        brand_bg_color: reseller.brand_bg_color,
        brand_logo: reseller.brand_logo,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Change admin password
router.post('/admin/change-password', adminAuth, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    const db = getDB();
    const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
    if (!bcrypt.compareSync(oldPassword, admin.password)) {
      return res.status(401).json({ success: false, message: 'Wrong current password' });
    }
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hashed, req.admin.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
