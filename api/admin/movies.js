// api/admin/movies.js
const connectDB = require('../../lib/db');
const Movie = require('../../lib/models/Movie');
const WatchHistory = require('../../lib/models/WatchHistory');
const { requireAdmin } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = requireAdmin(async (req, res) => {
  if (setCors(req, res)) return;
  await connectDB();

  // GET — list all movies (including unpublished) with stats
  if (req.method === 'GET') {
    const { page = 1, limit = 50, search, type, published } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const filter = {};
    if (search) filter.$text = { $search: search };
    if (type)   filter.type  = type;
    if (published !== undefined) filter.isPublished = published === 'true';

    const [movies, total] = await Promise.all([
      Movie.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).select('-seasons'),
      Movie.countDocuments(filter),
    ]);

    // Quick stats
    const stats = await Movie.aggregate([
      { $group: {
        _id: null,
        totalMovies:  { $sum: { $cond: [{ $eq: ['$type', 'movie'] }, 1, 0] } },
        totalSeries:  { $sum: { $cond: [{ $eq: ['$type', 'series'] }, 1, 0] } },
        totalOriginals: { $sum: { $cond: [{ $eq: ['$isOriginal', true] }, 1, 0] } },
        totalViews:   { $sum: '$views' },
        published:    { $sum: { $cond: ['$isPublished', 1, 0] } },
        drafts:       { $sum: { $cond: [{ $not: '$isPublished' }, 1, 0] } },
      }},
    ]);

    return res.status(200).json({
      movies,
      total,
      page: Number(page),
      stats: stats[0] || {},
    });
  }

  // POST — create new movie
  if (req.method === 'POST') {
    const movie = new Movie(req.body);
    await movie.save();
    return res.status(201).json({ movie });
  }

  // PATCH — bulk update (e.g., publish/unpublish multiple)
  if (req.method === 'PATCH') {
    const { ids, updates } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'ids required' });
    await Movie.updateMany({ _id: { $in: ids } }, updates);
    return res.status(200).json({ message: `Updated ${ids.length} movies` });
  }

  // DELETE — remove movie + all watch history
  if (req.method === 'DELETE') {
    const { id } = req.query;
    await Promise.all([
      Movie.findByIdAndDelete(id),
      WatchHistory.deleteMany({ movieId: id }),
    ]);
    return res.status(200).json({ message: 'Movie deleted' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
});
