const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// -------------------------------------------------------------
// MONGODB CONNECTION
// -------------------------------------------------------------
// Vercel will inject process.env.MONGODB_URI from your project settings
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://saikambala111:<your_password>@cluster0.mongodb.net/skflip?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const JWT_SECRET = process.env.JWT_SECRET || 'skflip_super_secret_key_123';

// -------------------------------------------------------------
// DATABASE SCHEMAS
// -------------------------------------------------------------
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' } // Can be 'user' or 'admin'
}, { timestamps: true });

const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: { type: String, enum: ['movie', 'series', 'original'], default: 'movie' },
  releaseYear: { type: Number },
  rating: { type: String },
  genres: [String],
  description: { type: String },
  posterUrl: { type: String },
  backdropUrl: { type: String },
  hlsUrl: { type: String },
  videoUrl: { type: String },
  isPublished: { type: Boolean, default: true }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Movie = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);

// -------------------------------------------------------------
// AUTHENTICATION ROUTES
// -------------------------------------------------------------

// Signup Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists in the system.' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Determine role: Make the first user an admin, others regular users
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await User.create({ name, email, password: hashedPassword, role });
    
    // Create token
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Login Route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// -------------------------------------------------------------
// CONTENT ROUTES (Public)
// -------------------------------------------------------------

// Get Movies/Series/Originals
app.get('/api/movies', async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    const query = { isPublished: true };
    
    if (type) {
      query.type = type;
    }
    
    const movies = await Movie.find(query)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 }); // Newest first
      
    res.json({ movies });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// -------------------------------------------------------------
// ADMIN ROUTES
// -------------------------------------------------------------

// Add New Content
app.post('/api/movies', async (req, res) => {
  try {
    // In a full production app, you would verify the JWT token here
    // to ensure the requester is an admin.
    const movie = await Movie.create(req.body);
    res.json(movie);
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Get Admin Dashboard Stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalMovies = await Movie.countDocuments({ type: 'movie' });
    const totalSeries = await Movie.countDocuments({ type: 'series' });
    const totalOriginals = await Movie.countDocuments({ type: 'original' });
    const totalUsers = await User.countDocuments();
    const totalContent = await Movie.countDocuments();
    
    res.json({
      overview: { 
        totalMovies, 
        totalSeries, 
        totalOriginals, 
        totalContent, 
        totalUsers 
      }
    });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Get All Content for Admin Table
app.get('/api/admin/movies', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 });
    res.json({ movies });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Export the Express API to work with Vercel Serverless Functions
module.exports = app;
