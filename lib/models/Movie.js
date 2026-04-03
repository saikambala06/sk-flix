// lib/models/Movie.js
const mongoose = require('mongoose');

const SubtitleSchema = new mongoose.Schema({
  language: String,
  label:    String,
  url:      String,   // .vtt file URL
});

const EpisodeSchema = new mongoose.Schema({
  episodeNumber: Number,
  title:         String,
  description:   String,
  duration:      Number,   // seconds
  thumbnail:     String,
  videoUrl:      String,   // HLS .m3u8 or direct MP4
  hlsUrl:        String,
  introStart:    Number,   // seconds
  introEnd:      Number,
  subtitles:     [SubtitleSchema],
});

const SeasonSchema = new mongoose.Schema({
  seasonNumber: Number,
  title:        String,
  episodes:     [EpisodeSchema],
});

const MovieSchema = new mongoose.Schema({
  title:        { type: String, required: true, index: true },
  slug:         { type: String, unique: true, index: true },
  description:  { type: String, required: true },
  type:         { type: String, enum: ['movie', 'series', 'original'], default: 'movie' },
  
  // Media
  posterUrl:    { type: String, default: '' },
  backdropUrl:  { type: String, default: '' },
  trailerUrl:   { type: String, default: '' },
  videoUrl:     { type: String, default: '' },   // For movies: direct/HLS
  hlsUrl:       { type: String, default: '' },   // .m3u8 URL
  cloudinaryId: { type: String, default: '' },

  // Metadata
  genres:       [{ type: String, index: true }],
  tags:         [String],
  cast:         [{ name: String, role: String, photo: String }],
  director:     String,
  releaseYear:  Number,
  duration:     Number,   // in minutes (for movies)
  language:     { type: String, default: 'en' },
  country:      String,
  rating:       { type: Number, min: 0, max: 10, default: 0 },
  ratingCount:  { type: Number, default: 0 },
  maturityRating: { type: String, default: 'PG-13' },
  
  // Series fields
  seasons:      [SeasonSchema],
  totalEpisodes: Number,
  totalSeasons:  Number,

  // Subtitles (movies)
  subtitles:    [SubtitleSchema],
  introStart:   Number,
  introEnd:     Number,

  // Admin
  isPublished:  { type: Boolean, default: false },
  isFeatured:   { type: Boolean, default: false },
  isOriginal:   { type: Boolean, default: false },
  views:        { type: Number, default: 0 },
  createdAt:    { type: Date, default: Date.now },
}, { timestamps: true });

// Text search index
MovieSchema.index({ title: 'text', description: 'text', tags: 'text' });

// Auto-generate slug
MovieSchema.pre('save', function (next) {
  if (!this.slug) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
  }
  next();
});

module.exports = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);
