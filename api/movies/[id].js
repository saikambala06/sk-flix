// api/movies/[id].js
const connectDB = require('../../lib/db');
const Movie = require('../../lib/models/Movie');
const WatchHistory = require('../../lib/models/WatchHistory');
const { verifyToken, requireAdmin } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;
  await connectDB();

  const { id } = req.query;

  // ── GET single movie ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const movie = await Movie.findOne({
        $or: [{ _id: id.match(/^[a-f\d]{24}$/i) ? id : null }, { slug: id }],
        isPublished: true,
      });
      if (!movie) return res.status(404).json({ error: 'Movie not found' });

      // Increment views
      await Movie.findByIdAndUpdate(movie._id, { $inc: { views: 1 } });

      // Attach user progress if authenticated
      let userProgress = null;
      try {
        const tokenUser = verifyToken(req);
        userProgress = await WatchHistory.findOne({ userId: tokenUser.userId, movieId: movie._id });
      } catch (_) {}

      return res.status(200).json({ movie, userProgress });
    } catch (err) {
      console.error('[movies/[id] GET]', err);
      return res.status(500).json({ error: 'Failed to fetch movie' });
    }
  }

  // ── PATCH / DELETE (admin) ────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'DELETE') {
    return requireAdmin(async (req, res) => {
      try {
        if (req.method === 'DELETE') {
          await Movie.findByIdAndDelete(id);
          return res.status(200).json({ message: 'Movie deleted' });
        }
        const movie = await Movie.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        return res.status(200).json({ movie });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    })(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
