// api/search/index.js
const connectDB = require('../../lib/db');
const Movie = require('../../lib/models/Movie');
const setCors = require('../../lib/cors');

module.exports = async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  const { q = '', genre, type, year, sort = 'score', page = 1, limit = 24 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  try {
    const filter = { isPublished: true };

    if (q.trim()) {
      filter.$text = { $search: q.trim() };
    }
    if (genre) filter.genres = { $in: [genre] };
    if (type)  filter.type   = type;
    if (year)  filter.releaseYear = Number(year);

    const sortMap = {
      score:   q.trim() ? { score: { $meta: 'textScore' }, rating: -1 } : { rating: -1 },
      rating:  { rating: -1 },
      newest:  { releaseYear: -1, createdAt: -1 },
      popular: { views: -1 },
    };
    const sortOpts = sortMap[sort] || sortMap.score;

    const projection = q.trim()
      ? { score: { $meta: 'textScore' }, title: 1, posterUrl: 1, genres: 1, rating: 1, releaseYear: 1, type: 1, slug: 1, duration: 1 }
      : { title: 1, posterUrl: 1, genres: 1, rating: 1, releaseYear: 1, type: 1, slug: 1, duration: 1 };

    const [results, total] = await Promise.all([
      Movie.find(filter, projection).sort(sortOpts).skip(skip).limit(Number(limit)),
      Movie.countDocuments(filter),
    ]);

    // Genre aggregation for facets
    const genreFacets = await Movie.aggregate([
      { $match: { isPublished: true } },
      { $unwind: '$genres' },
      { $group: { _id: '$genres', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    return res.status(200).json({
      results,
      total,
      page: Number(page),
      hasMore: skip + results.length < total,
      facets: { genres: genreFacets },
    });
  } catch (err) {
    console.error('[search]', err);
    return res.status(500).json({ error: 'Search failed' });
  }
};
