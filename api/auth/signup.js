// api/auth/signup.js
const connectDB = require('../../lib/db');
const User = require('../../lib/models/User');
const { signToken } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await connectDB();
    const { name, email, password } = req.body;

    // Validate
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check duplicate
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    // Create user
    const user = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      profiles: [{ name: name.trim(), isKids: false }],
    });
    await user.save();

    const token = signToken({ userId: user._id, email: user.email, role: user.role });

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: user.toSafeObject(),
    });
  } catch (err) {
    console.error('[signup]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
