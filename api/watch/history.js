// api/watch/history.js
const connectDB = require('../../lib/db');
const WatchHistory = require('../../lib/models/WatchHistory');
const { requireAuth } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = requireAuth(async (req, res, tokenUser) => {
  if (setCors(req, res)) return;
  await connectDB();

  const userId = tokenUser.userId;

  // ── GET — continue watching list ─────────────────────────────
  if (req.method === 'GET') {
    try {
      const history = await WatchHistory.find({ userId, completed: false, progress: { $gt: 0 } })
        .sort({ lastWatchedAt: -1 })
        .limit(20)
        .populate('movieId', 'title posterUrl backdropUrl type genres rating duration seasons');

      const continueWatching = history
        .filter(h => h.movieId)   // guard deleted movies
        .map(h => ({
          ...h.movieId.toObject(),
          watchProgress: h.progress,
          watchedSeconds: h.watchedSeconds,
          lastWatchedAt: h.lastWatchedAt,
          season: h.season,
          episode: h.episode,
        }));

      return res.status(200).json({ continueWatching });
    } catch (err) {
      console.error('[watch/history GET]', err);
      return res.status(500).json({ error: 'Failed to fetch watch history' });
    }
  }

  // ── POST — save / update watch progress ──────────────────────
  if (req.method === 'POST') {
    try {
      const { movieId, watchedSeconds, totalSeconds, season, episode, completed, liked, addedToList, clickSource } = req.body;
      if (!movieId) return res.status(400).json({ error: 'movieId required' });

      const progress = totalSeconds > 0 ? Math.min(100, Math.round((watchedSeconds / totalSeconds) * 100)) : 0;

      const update = {
        watchedSeconds: watchedSeconds || 0,
        totalSeconds:   totalSeconds   || 0,
        progress,
        completed:      completed || progress >= 90,
        lastWatchedAt:  new Date(),
        $inc: { watchCount: 1 },
      };
      if (season   != null) update.season   = season;
      if (episode  != null) update.episode  = episode;
      if (liked    != null) update.liked    = liked;
      if (addedToList != null) update.addedToList = addedToList;
      if (clickSource) update.clickSource = clickSource;

      const record = await WatchHistory.findOneAndUpdate(
        { userId, movieId },
        { $set: update },
        { upsert: true, new: true },
      );

      return res.status(200).json({ record });
    } catch (err) {
      console.error('[watch/history POST]', err);
      return res.status(500).json({ error: 'Failed to save progress' });
    }
  }

  // ── GET history (full list) ───────────────────────────────────
  if (req.method === 'GET' && req.query.all === 'true') {
    const history = await WatchHistory.find({ userId })
      .sort({ lastWatchedAt: -1 })
      .limit(100)
      .populate('movieId', 'title posterUrl type genres');
    return res.status(200).json({ history });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
