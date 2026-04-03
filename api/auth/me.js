// api/auth/me.js
const connectDB = require('../../lib/db');
const User = require('../../lib/models/User');
const { requireAuth } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = requireAuth(async (req, res, tokenUser) => {
  if (setCors(req, res)) return;

  if (req.method === 'GET') {
    try {
      await connectDB();
      const user = await User.findById(tokenUser.userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json({ user: user.toSafeObject() });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  // PATCH — update profile
  if (req.method === 'PATCH') {
    try {
      await connectDB();
      const { name, avatar, preferences, profiles } = req.body;
      const update = {};
      if (name) update.name = name;
      if (avatar) update.avatar = avatar;
      if (preferences) update.preferences = preferences;
      if (profiles) update.profiles = profiles;

      const user = await User.findByIdAndUpdate(tokenUser.userId, update, { new: true, runValidators: true });
      return res.status(200).json({ user: user.toSafeObject() });
    } catch (err) {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
