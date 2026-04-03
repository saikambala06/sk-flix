// api/movies/index.js
const connectDB = require('../../lib/db');
const Movie = require('../../lib/models/Movie');
const { requireAdmin } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

const PAGE_SIZE = 20;

module.exports = async (req, res) => {
  if (setCors(req, res)) return;

  await connectDB();

  // ── GET /api/movies ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const {
      type, genre, featured, original, page = 1,
      limit = PAGE_SIZE, sort = '-createdAt', search,
    } = req.query;

    const filter = { isPublished: true };
    if (type)     filter.type     = type;
    if (genre)    filter.genres   = { $in: Array.isArray(genre) ? genre : [genre] };
    if (featured) filter.isFeatured = featured === 'true';
    if (original) filter.isOriginal = original === 'true';
    if (search)   filter.$text = { $search: search };

    const skip = (Number(page) - 1) * Number(limit);

    try {
      const [movies, total] = await Promise.all([
        Movie.find(filter)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .select('-seasons.episodes.subtitles -__v'),
        Movie.countDocuments(filter),
      ]);

      return res.status(200).json({
        movies,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
          hasMore: skip + movies.length < total,
        },
      });
    } catch (err) {
      console.error('[movies/index GET]', err);
      return res.status(500).json({ error: 'Failed to fetch movies' });
    }
  }

  // ── POST /api/movies (admin only) ───────────────────────────────
  return requireAdmin(async (req, res) => {
    try {
      const movie = new Movie(req.body);
      await movie.save();
      return res.status(201).json({ movie });
    } catch (err) {
      console.error('[movies/index POST]', err);
      return res.status(400).json({ error: err.message });
    }
  })(req, res);
};
