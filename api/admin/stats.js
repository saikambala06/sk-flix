// api/admin/stats.js
const connectDB = require('../../lib/db');
const Movie = require('../../lib/models/Movie');
const User = require('../../lib/models/User');
const WatchHistory = require('../../lib/models/WatchHistory');
const { requireAdmin } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = requireAdmin(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo  = new Date(now - 7  * 24 * 60 * 60 * 1000);

    const [
      totalUsers, newUsersThisMonth, totalMovies, publishedMovies,
      totalWatches, watchesThisWeek,
      topMovies, genreDistribution, dailyWatches,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Movie.countDocuments(),
      Movie.countDocuments({ isPublished: true }),
      WatchHistory.countDocuments(),
      WatchHistory.countDocuments({ lastWatchedAt: { $gte: sevenDaysAgo } }),

      // Most watched movies
      WatchHistory.aggregate([
        { $group: { _id: '$movieId', watches: { $sum: '$watchCount' } } },
        { $sort: { watches: -1 } },
        { $limit: 10 },
        { $lookup: { from: 'movies', localField: '_id', foreignField: '_id', as: 'movie' } },
        { $unwind: '$movie' },
        { $project: { watches: 1, title: '$movie.title', type: '$movie.type', rating: '$movie.rating' } },
      ]),

      // Genre distribution
      Movie.aggregate([
        { $match: { isPublished: true } },
        { $unwind: '$genres' },
        { $group: { _id: '$genres', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),

      // Daily watches last 7 days
      WatchHistory.aggregate([
        { $match: { lastWatchedAt: { $gte: sevenDaysAgo } } },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$lastWatchedAt' } },
          count: { $sum: 1 },
        }},
        { $sort: { _id: 1 } },
      ]),
    ]);

    return res.status(200).json({
      overview: {
        totalUsers, newUsersThisMonth,
        totalMovies, publishedMovies,
        totalWatches, watchesThisWeek,
      },
      topMovies,
      genreDistribution,
      dailyWatches,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
