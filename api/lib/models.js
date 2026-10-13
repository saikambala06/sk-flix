'use strict';

const { mongoose } = require('./db');

/* ------------------------------------------------------------------ */
/*  User                                                              */
/* ------------------------------------------------------------------ */

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: { type: String, required: true, select: false },
    role: { type: String, default: 'user', enum: ['user', 'admin'] },
    avatarColor: { type: String, default: '' },
    plan: { type: String, enum: ['free', 'premium'], default: 'free' },

    // Password reset — the code is stored hashed, never in plain text.
    resetCodeHash: { type: String, select: false },
    resetCodeExpiry: { type: Date, select: false },
    resetAttempts: { type: Number, default: 0, select: false },
    resetLastSentAt: { type: Date, select: false },

    // Invalidates every JWT issued before this moment (used on password change).
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */
/*  Content                                                           */
/* ------------------------------------------------------------------ */

const EpisodeSchema = new mongoose.Schema(
  {
    season: { type: Number, default: 1 },
    episodeNumber: { type: Number },
    title: { type: String, trim: true },
    description: { type: String },
    thumbnailUrl: { type: String },
    videoUrl: { type: String },
    hlsUrl: { type: String },
    duration: { type: Number },
    airDate: { type: String },
  },
  { _id: false }
);

const MovieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['movie', 'series', 'original'],
      default: 'movie',
      index: true,
    },
    releaseYear: { type: Number, min: 1880, max: 2100 },
    rating: { type: String, trim: true },
    genres: { type: [String], index: true },
    description: { type: String, maxlength: 5000 },
    posterUrl: { type: String },
    backdropUrl: { type: String },
    trailerUrl: { type: String },
    hlsUrl: { type: String },
    videoUrl: { type: String },
    duration: { type: Number },
    episodes: [EpisodeSchema],
    episodeCount: { type: Number },
    seasonCount: { type: Number },
    audioLanguages: [String],
    subtitleLanguages: [String],
    cast: [String],
    director: { type: String, trim: true },

    // Engagement + curation
    views: { type: Number, default: 0, index: true },
    avgRating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0 },
    featured: { type: Boolean, default: false, index: true },
    isPublished: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

// Weighted full-text index powers /api/movies?search=
MovieSchema.index(
  { title: 'text', description: 'text', genres: 'text', cast: 'text' },
  { weights: { title: 10, genres: 5, cast: 3, description: 1 }, name: 'content_search' }
);
// Common list query: published items, newest first.
MovieSchema.index({ isPublished: 1, createdAt: -1 });
MovieSchema.index({ isPublished: 1, type: 1, createdAt: -1 });

/* ------------------------------------------------------------------ */
/*  Reviews                                                           */
/* ------------------------------------------------------------------ */

const ReviewSchema = new mongoose.Schema(
  {
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, default: '' },
    stars: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, default: '', maxlength: 1000, trim: true },
  },
  { timestamps: true }
);

// One review per user per title; also the lookup index for a title's reviews.
ReviewSchema.index({ movieId: 1, userId: 1 }, { unique: true });
ReviewSchema.index({ movieId: 1, createdAt: -1 });

/* ------------------------------------------------------------------ */
/*  Wishlist / Continue watching                                      */
/* ------------------------------------------------------------------ */

const WishlistSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    movieIds: [{ type: String }],
    offerClaimed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const ContinueItemSchema = new mongoose.Schema(
  {
    movieId: { type: String, required: true },
    title: { type: String, default: '' },
    posterUrl: { type: String, default: '' },
    backdropUrl: { type: String, default: '' },
    type: { type: String, default: 'movie' },
    currentTime: { type: Number, default: 0 },
    duration: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ContinueWatchingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: [ContinueItemSchema],
  },
  { timestamps: true }
);

/* ------------------------------------------------------------------ */

// `mongoose.models.X || ...` prevents OverwriteModelError on warm invocations.
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Movie = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);
const Review = mongoose.models.Review || mongoose.model('Review', ReviewSchema);
const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', WishlistSchema);
const ContinueWatching =
  mongoose.models.ContinueWatching ||
  mongoose.model('ContinueWatching', ContinueWatchingSchema);

module.exports = { User, Movie, Review, Wishlist, ContinueWatching };
