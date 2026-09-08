'use strict';

const express = require('express');
const { Movie, User, Review } = require('../lib/models');
const { requireAuth, requireAdmin, publicUser } = require('../lib/auth');
const { cleanMoviePayload, isObjectId } = require('../lib/validate');

const router = express.Router();

/**
 * THE important line in this file.
 *
 * Previously every one of these routes was reachable by anyone with the URL:
 * listing all users, changing roles, deleting content. Both middlewares now
 * run before anything below, so the admin API is closed by default and a route
 * added later cannot accidentally ship unprotected.
 */
router.use(requireAuth, requireAdmin);

const clampInt = (value, min, max, fallback) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/* ------------------------------------------------------------------ */
/*  Dashboard                                                         */
/* ------------------------------------------------------------------ */

router.get('/stats', async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalMovies,
      totalSeries,
      totalOriginals,
      totalContent,
      unpublished,
      totalUsers,
      newUsers,
      totalReviews,
      viewAgg,
      topTitles,
      recentUsers,
    ] = await Promise.all([
      Movie.countDocuments({ type: 'movie' }),
      Movie.countDocuments({ type: 'series' }),
      Movie.countDocuments({ type: 'original' }),
      Movie.countDocuments(),
      Movie.countDocuments({ isPublished: false }),
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Review.countDocuments(),
      Movie.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
      Movie.find().select('title type views avgRating posterUrl').sort({ views: -1 }).limit(5).lean(),
      User.find().select('name email role createdAt').sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    // Missing a playable source is the failure mode that silently breaks the
    // player, so surface it on the dashboard rather than waiting for a report.
    const missingMedia = await Movie.countDocuments({
      type: 'movie',
      $and: [
        { $or: [{ videoUrl: { $in: [null, ''] } }, { videoUrl: { $exists: false } }] },
        { $or: [{ hlsUrl: { $in: [null, ''] } }, { hlsUrl: { $exists: false } }] },
      ],
    });

    res.json({
      overview: {
        totalMovies,
        totalSeries,
        totalOriginals,
        totalContent,
        totalUsers,
        unpublished,
        newUsers,
        totalReviews,
        totalViews: viewAgg[0]?.total || 0,
        missingMedia,
      },
      topTitles,
      recentUsers,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Content management                                                */
/* ------------------------------------------------------------------ */

router.get('/movies', async (req, res, next) => {
  try {
    const limit = clampInt(req.query.limit, 1, 500, 200);
    const page = clampInt(req.query.page, 1, 1000, 1);
    const query = {};

    if (req.query.search) {
      const term = String(req.query.search).trim().slice(0, 100);
      query.title = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (req.query.type) query.type = req.query.type;
    if (req.query.published === 'false') query.isPublished = false;

    const [movies, total] = await Promise.all([
      Movie.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Movie.countDocuments(query),
    ]);

    res.json({ movies, pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 } });
  } catch (err) {
    next(err);
  }
});

router.post('/movies', async (req, res, next) => {
  try {
    // Whitelist the payload: a raw req.body spread would let a caller set
    // views, avgRating or any future internal field.
    const data = cleanMoviePayload(req.body);

    if (!data.title || !String(data.title).trim()) {
      return res.status(400).json({ error: 'Give the title a name.' });
    }

    const movie = await Movie.create(data);
    res.status(201).json(movie);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Check the fields and try again.' });
    }
    next(err);
  }
});

router.put('/movies/:id', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    const data = cleanMoviePayload(req.body);

    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    ).lean();

    if (!movie) return res.status(404).json({ error: 'We could not find that title.' });
    res.json(movie);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: Object.values(err.errors)[0]?.message || 'Check the fields and try again.' });
    }
    next(err);
  }
});

router.patch('/movies/:id/publish', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { $set: { isPublished: Boolean(req.body.isPublished) } },
      { new: true }
    )
      .select('title isPublished')
      .lean();

    if (!movie) return res.status(404).json({ error: 'We could not find that title.' });
    res.json(movie);
  } catch (err) {
    next(err);
  }
});

router.delete('/movies/:id', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That title id is not valid.' });
    }
    const movie = await Movie.findByIdAndDelete(req.params.id).lean();
    if (!movie) return res.status(404).json({ error: 'We could not find that title.' });

    // Clean up the reviews that pointed at it.
    await Review.deleteMany({ movieId: req.params.id });

    res.json({ message: `Deleted “${movie.title}”.`, deleted: { _id: movie._id, title: movie.title } });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  User management                                                   */
/* ------------------------------------------------------------------ */

router.get('/users', async (req, res, next) => {
  try {
    const limit = clampInt(req.query.limit, 1, 200, 100);
    const page = clampInt(req.query.page, 1, 1000, 1);
    const query = {};

    if (req.query.search) {
      const term = String(req.query.search).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [{ name: new RegExp(term, 'i') }, { email: new RegExp(term, 'i') }];
    }

    const [users, total] = await Promise.all([
      User.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(query),
    ]);

    res.json({
      users: users.map((u) => ({ ...publicUser(u), lastLoginAt: u.lastLoginAt })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
  } catch (err) {
    next(err);
  }
});

router.put('/users/:id', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That user id is not valid.' });
    }
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be user or admin.' });
    }

    // Guard against an admin demoting themselves and locking everyone out.
    if (String(req.params.id) === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin access.' });
    }
    if (role === 'user') {
      const admins = await User.countDocuments({ role: 'admin' });
      if (admins <= 1) {
        return res.status(400).json({ error: 'Keep at least one administrator.' });
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, { $set: { role } }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'We could not find that account.' });

    res.json(publicUser(user));
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: 'That user id is not valid.' });
    }
    if (String(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account here.' });
    }

    const target = await User.findById(req.params.id).select('role email').lean();
    if (!target) return res.status(404).json({ error: 'We could not find that account.' });

    if (target.role === 'admin') {
      const admins = await User.countDocuments({ role: 'admin' });
      if (admins <= 1) return res.status(400).json({ error: 'Keep at least one administrator.' });
    }

    await User.findByIdAndDelete(req.params.id);
    await Review.deleteMany({ userId: req.params.id });

    res.json({ message: `Deleted the account for ${target.email}.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
