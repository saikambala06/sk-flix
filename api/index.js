const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saikambala111:<your_password>@cluster0.mongodb.net/skflip?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI).then(() => console.log('MongoDB Connected')).catch(err => console.log(err));

// --- SCHEMAS ---
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' }
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'series', 'original'], default: 'movie' },
  releaseYear: Number,
  rating: { type: Number, default: 0 },
  genres: [String],
  description: String,
  posterUrl: String,
  backdropUrl: String,
  hlsUrl: String,
  videoUrl: String,
  isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Movie = mongoose.model('Movie', MovieSchema);

const JWT_SECRET = process.env.JWT_SECRET || 'skflip_super_secret_key';

// --- ROUTES ---

// Auth: Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (await User.findOne({ email })) return res.status(400).json({ error: 'Email already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Auth: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Public: Get Movies
app.get('/api/movies', async (req, res) => {
  try {
    const { type, limit = 20 } = req.query;
    const query = { isPublished: true };
    if (type) query.type = type;
    
    const movies = await Movie.find(query).limit(parseInt(limit)).sort({ createdAt: -1 });
    res.json({ movies });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Admin: Add Movie
app.post('/api/movies', async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.json(movie);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Admin: Stats Dashboard
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalMovies = await Movie.countDocuments({ type: 'movie' });
    const totalSeries = await Movie.countDocuments({ type: 'series' });
    const totalUsers = await User.countDocuments();
    const publishedMovies = await Movie.countDocuments({ isPublished: true });
    
    res.json({
      overview: { totalMovies, totalSeries, totalUsers, totalWatches: 0, publishedMovies }
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Admin: Get All Content for Table
app.get('/api/admin/movies', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 });
    res.json({ movies });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Export for Vercel
module.exports = app;
