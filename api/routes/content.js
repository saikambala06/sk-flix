'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { Movie, Review } = require('../lib/models');
const { requireAuth, optionalAuth } = require('../lib/auth');
const { isObjectId } = require('../lib/validate');
const { rateLimit } = require('../lib/rateLimit');

const router = express.Router();

// Never ship the stream URLs in list responses — only the detail endpoint needs them.
const LIST_FIELDS =
  'title type releaseYear rating genres description posterUrl backdropUrl duration ' +
  'episodeCount seasonCount views avgRating ratingCount featured createdAt';

const VALID_TYPES = ['movie', 'series', 'original'];
const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  popular: { views: -1, createdAt: -1 },
  rated: { avgRating: -1, ratingCount: -1 },
  az: { title: 1 },
  year: { releaseYear: -1 },
};

const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** Escape a user string before it goes into a RegExp. */
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ------------------------------------------------------------------ */
/*  GET /api/home — everything the landing page needs, in one call     */
/* ------------------------------------------------------------------ */

router.get('/home', async (req, res, next) => {
  try {
    const base = { isPublished: true };

    const [movies, series, originals, trending, featured] = await Promise.all([
      Movie.find({ ...base, type: 'movie' }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(24).lean(),
      Movie.find({ ...base, type: 'series' }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(24).lean(),
      Movie.find({ ...base, type: 'original' }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(24).lean(),
      Movie.find(base).select(LIST_FIELDS).sort({ views: -1, createdAt: -1 }).limit(12).lean(),
      Movie.find({ ...base, featured: true }).select(LIST_FIELDS).sort({ createdAt: -1 }).limit(6).lean(),
    ]);

    // A short cache lets the CDN absorb repeat traffic while staying fresh.
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.json({ movies, series, originals, trending, featured });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/movies — filter, search, sort, paginate                   */
/* ------------------------------------------------------------------ */

router.get('/movies', async (req, res, next) => {
  try {
    const { type, genre, search, year, sort = 'newest' } = req.query;
    const limit = clampInt(req.query.limit, 1, 100, 50);
    const page = clampInt(req.query.page, 1, 10_000, 1);

    const query = { isPublished: true };

    if (type) {
      if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Type must be movie, series or original.' });
      }
      query.type = type;
    }
    if (genre) query.genres = new RegExp(`^${escapeRe(genre)}$`, 'i');
    if (year) {
      const y = parseInt(year, 10);
      if (!Number.isNaN(y)) query.releaseYear = y;
    }

    let sortSpec = SORTS[sort] || SORTS.newest;
    let projection = LIST_FIELDS;

    if (search) {
      const term = String(search).trim().slice(0, 100);
      if (term) {
        // Text index first; fall back to a prefix regex for partial words,
        // which $text alone will not match.
        query.$or = [
          { $text: { $search: term } },
          { title: new RegExp(escapeRe(term), 'i') },
        ];
      }
    }

    const [items, total] = await Promise.all([
      Movie.find(query)
        .select(projection)
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Movie.countDocuments(query),
    ]);

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    res.json({
      movies: items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit) || 1,
        hasMore: page * limit < total,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/genres — genre list with live counts                      */
/* ------------------------------------------------------------------ */

router.get('/genres', async (req, res, next) => {
  try {
    const rows = await Movie.aggregate([
      { $match: { isPublished: true } },
      { $unwind: '$genres' },
      { $group: { _id: { $trim: { input: '$genres' } }, count: { $sum: 1 } } },
      { $match: { _id: { $nin: ['', null] } } },
      { $sort: { count: -1 } },
      { $limit: 40 },
      { $project: { _id: 0, name: '$_id', count: 1 } },
    ]);

    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
    res.json({ genres: rows });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/movies/:id                                                */
/* ------------------------------------------------------------------ */

router.get('/movies/:id', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    const movie = await Movie.findById(req.params.id).lean();
    if (!movie || movie.isPublished === false) {
      return res.status(404).json({ error: 'We could not find that title.' });
    }
    res.json(movie);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  GET /api/movies/:id/related                                        */
/* ------------------------------------------------------------------ */

router.get('/movies/:id/related', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    const movie = await Movie.findById(req.params.id).select('genres type').lean();
    if (!movie) return res.status(404).json({ error: 'We could not find that title.' });

    const genres = (movie.genres || []).filter(Boolean);
    const query = { _id: { $ne: movie._id }, isPublished: true };
    if (genres.length) query.genres = { $in: genres };

    let related = await Movie.find(query).select(LIST_FIELDS).sort({ views: -1 }).limit(12).lean();

    // If nothing shares a genre, fall back to the same content type.
    if (related.length < 6) {
      const extra = await Movie.find({
        _id: { $ne: movie._id, $nin: related.map((r) => r._id) },
        isPublished: true,
        type: movie.type,
      })
        .select(LIST_FIELDS)
        .sort({ createdAt: -1 })
        .limit(12 - related.length)
        .lean();
      related = related.concat(extra);
    }

    res.json({ related });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  POST /api/movies/:id/view — increment the play counter             */
/* ------------------------------------------------------------------ */

router.post(
  '/movies/:id/view',
  rateLimit({ name: 'view', windowMs: 60_000, max: 60 }),
  async (req, res, next) => {
    try {
      if (!isObjectId(req.params.id)) return res.status(204).end();
      await Movie.updateOne({ _id: req.params.id }, { $inc: { views: 1 } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
);

/* ------------------------------------------------------------------ */
/*  Reviews                                                            */
/* ------------------------------------------------------------------ */

router.get('/movies/:id/reviews', optionalAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    const limit = clampInt(req.query.limit, 1, 50, 20);

    const reviews = await Review.find({ movieId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('userName stars comment createdAt userId')
      .lean();

    const mine = req.user
      ? reviews.find((r) => String(r.userId) === req.user.id) ||
        (await Review.findOne({ movieId: req.params.id, userId: req.user.id })
          .select('stars comment createdAt')
          .lean())
      : null;

    // Strip user ids from the public payload.
    res.json({
      reviews: reviews.map(({ userId, ...rest }) => rest),
      mine: mine ? { stars: mine.stars, comment: mine.comment } : null,
    });
  } catch (err) {
    next(err);
  }
});

/** Recompute the cached average on the movie document. */
async function refreshRating(movieId) {
  const [agg] = await Review.aggregate([
    { $match: { movieId: new mongoose.Types.ObjectId(String(movieId)) } },
    { $group: { _id: null, avg: { $avg: '$stars' }, count: { $sum: 1 } } },
  ]);
  await Movie.updateOne(
    { _id: movieId },
    {
      $set: {
        avgRating: agg ? Math.round(agg.avg * 10) / 10 : 0,
        ratingCount: agg ? agg.count : 0,
      },
    }
  );
}

router.post(
  '/movies/:id/reviews',
  requireAuth,
  rateLimit({ name: 'review', windowMs: 60_000, max: 10 }),
  async (req, res, next) => {
    try {
      if (!isObjectId(req.params.id)) {
        return res.status(400).json({ error: 'That title id is not valid.' });
      }

      const stars = parseInt(req.body.stars, 10);
      if (!(stars >= 1 && stars <= 5)) {
        return res.status(400).json({ error: 'Choose a rating from 1 to 5 stars.' });
      }
      const comment = String(req.body.comment || '').trim().slice(0, 1000);

      const movie = await Movie.findById(req.params.id).select('_id').lean();
      if (!movie) return res.status(404).json({ error: 'We could not find that title.' });

      await Review.findOneAndUpdate(
        { movieId: req.params.id, userId: req.user.id },
        { $set: { stars, comment, userName: req.user.name || 'Viewer' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await refreshRating(req.params.id);
      const updated = await Movie.findById(req.params.id).select('avgRating ratingCount').lean();

      res.json({ message: 'Rating saved.', ...updated });
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/movies/:id/reviews', requireAuth, async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    await Review.deleteOne({ movieId: req.params.id, userId: req.user.id });
    await refreshRating(req.params.id);
    res.json({ message: 'Rating removed.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
