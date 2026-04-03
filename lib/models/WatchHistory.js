// lib/models/WatchHistory.js
const mongoose = require('mongoose');

const WatchEventSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  movieId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },

  // Playback state
  watchedSeconds: { type: Number, default: 0 },
  totalSeconds:   { type: Number, default: 0 },
  progress:       { type: Number, default: 0, min: 0, max: 100 }, // percentage
  completed:      { type: Boolean, default: false },

  // For series
  season:         { type: Number, default: null },
  episode:        { type: Number, default: null },

  // Engagement signals (for AI recommendations)
  watchCount:     { type: Number, default: 1 },
  liked:          { type: Boolean, default: null },   // null=no action, true=liked, false=disliked
  addedToList:    { type: Boolean, default: false },
  clickSource:    { type: String, default: 'browse' }, // 'recommendation', 'search', 'browse', 'autoplay'

  lastWatchedAt:  { type: Date, default: Date.now },
  firstWatchedAt: { type: Date, default: Date.now },
}, { timestamps: true });

WatchEventSchema.index({ userId: 1, movieId: 1 }, { unique: true });
WatchEventSchema.index({ userId: 1, lastWatchedAt: -1 });

module.exports = mongoose.models.WatchHistory || mongoose.model('WatchHistory', WatchEventSchema);
