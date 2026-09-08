'use strict';

const express = require('express');
const { Wishlist, ContinueWatching, Movie } = require('../lib/models');
const { requireAuth } = require('../lib/auth');
const { isObjectId } = require('../lib/validate');

const router = express.Router();

// requireAuth is attached per route rather than with router.use(), so an
// unknown path falls through to the 404 handler instead of answering 401.

const MAX_WISHLIST = 300;
const MAX_CONTINUE = 20;

/* ------------------------------------------------------------------ */
/*  Wishlist                                                          */
/* ------------------------------------------------------------------ */

router.get('/wishlist', requireAuth, async (req, res, next) => {
  try {
    const list = await Wishlist.findOne({ userId: req.user.id }).lean();
    res.json({
      movieIds: list?.movieIds || [],
      offerClaimed: list?.offerClaimed || false,
    });
  } catch (err) {
    next(err);
  }
});

/** Hydrated version — saves the client from N follow-up lookups. */
router.get('/wishlist/full', requireAuth, async (req, res, next) => {
  try {
    const list = await Wishlist.findOne({ userId: req.user.id }).lean();
    const ids = (list?.movieIds || []).filter(isObjectId);
    if (!ids.length) return res.json({ items: [], offerClaimed: list?.offerClaimed || false });

    const movies = await Movie.find({ _id: { $in: ids }, isPublished: true })
      .select('title type releaseYear rating genres posterUrl backdropUrl duration avgRating')
      .lean();

    // Preserve the order the user saved them in.
    const byId = new Map(movies.map((m) => [String(m._id), m]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);

    res.json({ items, offerClaimed: list?.offerClaimed || false });
  } catch (err) {
    next(err);
  }
});

router.post('/wishlist/toggle/:movieId', requireAuth, async (req, res, next) => {
  try {
    const { movieId } = req.params;
    if (!isObjectId(movieId)) return res.status(400).json({ error: 'That title id is not valid.' });

    const list =
      (await Wishlist.findOne({ userId: req.user.id })) ||
      new Wishlist({ userId: req.user.id, movieIds: [] });

    const index = list.movieIds.indexOf(movieId);
    if (index > -1) {
      list.movieIds.splice(index, 1);
    } else {
      if (list.movieIds.length >= MAX_WISHLIST) {
        return res.status(400).json({ error: `Your list holds up to ${MAX_WISHLIST} titles.` });
      }
      list.movieIds.push(movieId);
    }

    await list.save();
    res.json({ movieIds: list.movieIds, added: index === -1 });
  } catch (err) {
    next(err);
  }
});

router.put('/wishlist', requireAuth, async (req, res, next) => {
  try {
    const incoming = req.body.movieIds;
    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'movieIds must be an array.' });
    }
    const movieIds = [...new Set(incoming.filter(isObjectId))].slice(0, MAX_WISHLIST);

    const list = await Wishlist.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { movieIds } },
      { upsert: true, new: true }
    ).lean();

    res.json({ movieIds: list.movieIds });
  } catch (err) {
    next(err);
  }
});

router.post('/wishlist/claim', requireAuth, async (req, res, next) => {
  try {
    const list = await Wishlist.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { offerClaimed: true } },
      { upsert: true, new: true }
    ).lean();
    res.json({ offerClaimed: list.offerClaimed });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------------------------------------ */
/*  Continue watching                                                 */
/* ------------------------------------------------------------------ */

router.get('/continue-watching', requireAuth, async (req, res, next) => {
  try {
    const doc = await ContinueWatching.findOne({ userId: req.user.id }).lean();
    res.json({ items: doc?.items || [] });
  } catch (err) {
    next(err);
  }
});

router.post('/continue-watching', requireAuth, async (req, res, next) => {
  try {
    const { movieId, title, posterUrl, backdropUrl, type } = req.body;
    if (!movieId) return res.status(400).json({ error: 'movieId is required.' });

    const currentTime = Math.max(0, Math.floor(Number(req.body.currentTime) || 0));
    const duration = Math.max(0, Math.floor(Number(req.body.duration) || 0));

    const doc =
      (await ContinueWatching.findOne({ userId: req.user.id })) ||
      new ContinueWatching({ userId: req.user.id, items: [] });

    doc.items = doc.items.filter((item) => item.movieId !== String(movieId));
    doc.items.unshift({
      movieId: String(movieId),
      title: String(title || '').slice(0, 200),
      posterUrl: String(posterUrl || '').slice(0, 500),
      backdropUrl: String(backdropUrl || '').slice(0, 500),
      type: String(type || 'movie'),
      currentTime,
      duration,
      updatedAt: new Date(),
    });
    doc.items = doc.items.slice(0, MAX_CONTINUE);

    await doc.save();
    res.json({ items: doc.items });
  } catch (err) {
    next(err);
  }
});

router.delete('/continue-watching/:movieId', requireAuth, async (req, res, next) => {
  try {
    const doc = await ContinueWatching.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { items: { movieId: String(req.params.movieId) } } },
      { new: true, upsert: true }
    ).lean();
    res.json({ items: doc?.items || [] });
  } catch (err) {
    next(err);
  }
});

router.delete('/continue-watching', requireAuth, async (req, res, next) => {
  try {
    await ContinueWatching.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { items: [] } },
      { upsert: true }
    );
    res.json({ items: [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
