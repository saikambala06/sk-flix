// api/watch/list.js — user's watchlist (add/remove/get)
const connectDB = require('../../lib/db');
const WatchHistory = require('../../lib/models/WatchHistory');
const Movie = require('../../lib/models/Movie');
const { requireAuth } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = requireAuth(async (req, res, tokenUser) => {
  if (setCors(req, res)) return;
  await connectDB();
  const userId = tokenUser.userId;

  // GET — fetch full watchlist
  if (req.method === 'GET') {
    const records = await WatchHistory.find({ userId, addedToList: true })
      .sort({ updatedAt: -1 })
      .populate('movieId', 'title posterUrl backdropUrl genres rating releaseYear type duration slug');

    const list = records.filter(r => r.movieId).map(r => ({
      ...r.movieId.toObject(),
      progress: r.progress,
      addedAt: r.updatedAt,
    }));

    return res.status(200).json({ list, total: list.length });
  }

  // POST — toggle watchlist for a movie
  if (req.method === 'POST') {
    const { movieId } = req.body;
    if (!movieId) return res.status(400).json({ error: 'movieId required' });

    const movie = await Movie.findById(movieId);
    if (!movie) return res.status(404).json({ error: 'Movie not found' });

    const existing = await WatchHistory.findOne({ userId, movieId });
    const newValue = !(existing?.addedToList);

    await WatchHistory.findOneAndUpdate(
      { userId, movieId },
      { $set: { addedToList: newValue }, $setOnInsert: { userId, movieId } },
      { upsert: true }
    );

    return res.status(200).json({ added: newValue, message: newValue ? 'Added to watchlist' : 'Removed from watchlist' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
