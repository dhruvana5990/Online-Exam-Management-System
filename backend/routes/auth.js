const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../lib/supabase');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
function makeToken(user) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role },
    process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}
router.post('/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = req.body.role;
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Name must be 2–80 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!['student', 'instructor'].includes(role)) return res.status(400).json({ error: 'Choose student or instructor.' });
    const password_hash = await bcrypt.hash(password, 12);
    const { data, error } = await supabase.from('app_users').insert({ name, email, password_hash, role }).select('*').single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
      throw error;
    }
    const user = publicUser(data);
    res.status(201).json({ message: 'Account created successfully.', user, token: makeToken(user) });
  } catch (err) { next(err); }
});
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const { data: user, error } = await supabase.from('app_users').select('*').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    const safe = publicUser(user);
    res.json({ message: 'Signed in successfully.', user: safe, token: makeToken(safe) });
  } catch (err) { next(err); }
});
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('app_users').select('id,name,email,role').eq('id', req.user.sub).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Account not found.' });
    res.json({ user: data });
  } catch (err) { next(err); }
});
module.exports = router;
