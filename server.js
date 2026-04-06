const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('MongoDB Error:', err));

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Models
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  watchlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Movie' }],
  watchHistory: [{
    movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie' },
    watchedSeconds: Number,
    totalSeconds: Number,
    lastWatched: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'series', 'original'], default: 'movie' },
  releaseYear: Number,
  description: String,
  rating: { type: Number, default: 0 },
  hlsUrl: String,
  videoUrl: String,
  posterUrl: String,
  backdropUrl: String,
  isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Movie = mongoose.model('Movie', MovieSchema);

// Auth Middleware
const requireAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Please authenticate.' });
  }
};

// --- AUTH ROUTES ---
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: 'Email already in use' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- PUBLIC MOVIE ROUTES ---
app.get('/api/movies', async (req, res) => {
  try {
    const { type, limit } = req.query;
    const query = { isPublished: true };
    if (type) query.type = type;
    const movies = await Movie.find(query).limit(parseInt(limit) || 20).sort({ createdAt: -1 });
    res.json({ movies });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/search', async (req, res) => {
  try {
    const movies = await Movie.find({ isPublished: true, title: { $regex: req.query.q, $options: 'i' } }).limit(10);
    res.json({ results: movies });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- PROTECTED USER ROUTES ---
app.post('/api/watch/list', requireAuth, async (req, res) => {
  try {
    const { movieId } = req.body;
    const user = req.user;
    const index = user.watchlist.indexOf(movieId);
    let added = false;
    if (index === -1) { user.watchlist.push(movieId); added = true; } 
    else { user.watchlist.splice(index, 1); }
    await user.save();
    res.json({ added, message: added ? 'Added to watchlist' : 'Removed from watchlist' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/watch/history', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('watchHistory.movieId');
    const continueWatching = user.watchHistory
      .filter(h => h.movieId && h.watchedSeconds < h.totalSeconds * 0.9)
      .sort((a, b) => b.lastWatched - a.lastWatched)
      .map(h => ({ ...h.movieId.toObject(), watchProgress: (h.watchedSeconds / h.totalSeconds) * 100 }));
    res.json({ continueWatching });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- ADMIN ROUTES ---
app.post('/api/movies', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const movie = new Movie(req.body); await movie.save(); res.json({ movie });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/admin/movies', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  try {
    const movies = await Movie.find().sort({ createdAt: -1 }); res.json({ movies });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/admin/stats', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });
  try {
    res.json({ overview: { 
      totalMovies: await Movie.countDocuments(), 
      totalUsers: await User.countDocuments() 
    }});
  } catch (error) { res.status(500).json({ error: error.message }); }
});

module.exports = app;