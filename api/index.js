const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// -------------------------------------------------------------
// MONGODB CONNECTION — FIXED FOR VERCEL SERVERLESS
// -------------------------------------------------------------
// ⚠️ REPLACE THIS with your actual MongoDB connection string
// Get one free at: https://www.mongodb.com/atlas
// Format: mongodb+srv://<username>:<REAL_PASSWORD>@cluster0.xxxxx.mongodb.net/skflip?retryWrites=true&w=majority
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ FATAL: MONGODB_URI environment variable is not set.');
  console.error('   Go to your Vercel project → Settings → Environment Variables');
  console.error('   Add MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/skflip');
}

const JWT_SECRET = process.env.JWT_SECRET || 'skflip_super_secret_key_2024_change_me';

// Track connection state to avoid reconnecting on every serverless invocation
let isConnected = false;
let isConnecting = false;

async function connectDB() {
  // If already connected, reuse the connection
  if (isConnected && mongoose.connection.readyState === 1) {
    return;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    // Wait for the in-progress connection
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (isConnected) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      // Timeout after 15 seconds
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 15000);
    });
  }

  isConnecting = true;

  try {
    // Disconnect any stale connection (important in serverless)
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
    }

    await mongoose.connect(MONGODB_URI, {
      // These options are critical for Vercel serverless
      serverSelectionTimeoutMS: 8000,    // Fail fast instead of hanging 30s
      connectTimeoutMS: 8000,            // Connection attempt timeout
      socketTimeoutMS: 45000,            // Socket idle timeout
      maxPoolSize: 5,                    // Limit connections in serverless
      minPoolSize: 1,                    // Keep at least 1 warm
      retryWrites: true,
      w: 'majority',
      // Don't let mongoose buffer operations — fail immediately if not connected
      bufferCommands: false,
    });

    isConnected = true;
    isConnecting = false;
    console.log('✅ MongoDB Connected');

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
      isConnected = false;
    });

    mongoose.connection.on('close', () => {
      console.log('⚠️ MongoDB connection closed');
      isConnected = false;
    });

  } catch (err) {
    isConnecting = false;
    isConnected = false;
    console.error('❌ MongoDB connection FAILED:', err.message);

    // Provide helpful error messages
    if (err.message.includes('authentication failed')) {
      console.error('   → Wrong username or password in your connection string');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('   → Cluster hostname not found — check your connection string');
    } else if (err.message.includes('timeout') || err.message.includes('timed out')) {
      console.error('   → Connection timed out — check your IP whitelist in MongoDB Atlas');
    } else if (err.message.includes('bad auth')) {
      console.error('   → Authentication failed — check credentials');
    }
  }
}

// -------------------------------------------------------------
// DATABASE SCHEMAS — Compile once, reuse across invocations
// -------------------------------------------------------------
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user', enum: ['user', 'admin'] }
}, { timestamps: true });

const EpisodeSchema = new mongoose.Schema({
  season:        { type: Number, default: 1 },
  episodeNumber: { type: Number },
  title:         { type: String },
  description:   { type: String },
  thumbnailUrl:  { type: String },
  videoUrl:      { type: String },
  hlsUrl:        { type: String },
  duration:      { type: Number },
  airDate:       { type: String }
}, { _id: false });

const MovieSchema = new mongoose.Schema({
  title:             { type: String, required: true },
  type:              { type: String, enum: ['movie', 'series', 'original'], default: 'movie' },
  releaseYear:       { type: Number },
  rating:            { type: String },
  genres:            [String],
  description:       { type: String },
  posterUrl:         { type: String },
  backdropUrl:       { type: String },
  hlsUrl:            { type: String },
  videoUrl:          { type: String },
  duration:          { type: Number },
  episodes:          [EpisodeSchema],
  episodeCount:      { type: Number },
  seasonCount:       { type: Number },
  audioLanguages:    [String],
  subtitleLanguages: [String],
  isPublished:       { type: Boolean, default: true }
}, { timestamps: true });

// Use existing model if already compiled (prevents OverwriteModelError in serverless)
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Movie = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);

// -------------------------------------------------------------
// MIDDLEWARE: Ensure DB is connected before every API call
// -------------------------------------------------------------
async function ensureDB(req, res, next) {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    await connectDB();
  }
  // If still not connected after retry, return error
  if (!isConnected || mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Database is currently unavailable. Please try again in a moment.',
      code: 'DB_UNAVAILABLE'
    });
  }
  next();
}

// Apply DB middleware to ALL routes
app.use(ensureDB);

// -------------------------------------------------------------
// AUTHENTICATION ROUTES
// -------------------------------------------------------------

// Signup Route
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists in the system.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // First user automatically becomes admin
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user';

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role
    });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists in the system.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Login Route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// CONTENT ROUTES (Public)
// -------------------------------------------------------------

app.get('/api/movies', async (req, res) => {
  try {
    const { type, limit = 50 } = req.query;
    const query = { isPublished: true };

    if (type) {
      const validTypes = ['movie', 'series', 'original'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Use: movie, series, or original.' });
      }
      query.type = type;
    }

    const movies = await Movie.find(query)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(); // .lean() for faster responses

    res.json({ movies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single movie by ID
app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id).lean();
    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }
    res.json(movie);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid content ID.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// ADMIN ROUTES
// -------------------------------------------------------------

// Add New Content
app.post('/api/movies', async (req, res) => {
  try {
    if (!req.body.title) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    const movie = await Movie.create(req.body);
    res.status(201).json(movie);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Content
app.put('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    ).lean();

    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    res.json(movie);
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid content ID.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete Content
app.delete('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id).lean();

    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    res.json({ message: `"${movie.title}" has been deleted.`, deleted: movie });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({ error: 'Invalid content ID.' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get Admin Dashboard Stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [totalMovies, totalSeries, totalOriginals, totalUsers, totalContent] = await Promise.all([
      Movie.countDocuments({ type: 'movie' }),
      Movie.countDocuments({ type: 'series' }),
      Movie.countDocuments({ type: 'original' }),
      User.countDocuments(),
      Movie.countDocuments()
    ]);

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

// Get All Content for Admin Table (includes unpublished)
app.get('/api/admin/movies', async (req, res) => {
  try {
    const movies = await Movie.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json({ movies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get All Users for Admin
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password') // Never send passwords
      .sort({ createdAt: -1 })
      .lean();

    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update User Role
app.put('/api/admin/users/:id', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "user" or "admin".' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    ).select('-password').lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete User
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id).select('-password').lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ message: `User "${user.email}" has been deleted.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// -------------------------------------------------------------
// HEALTH CHECK
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    dbState: mongoose.connection.readyState,
    dbStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState]
  });
});

// Export for Vercel Serverless
module.exports = app;


// ===== FIX: Scroll lock =====
function openDetailOverlay(){
  const overlay = document.querySelector(".detail-overlay-prime");
  overlay.classList.add("active");
  document.body.classList.add("no-scroll");
}

function closeDetailOverlay(){
  const overlay = document.querySelector(".detail-overlay-prime");
  overlay.classList.remove("active");
  document.body.classList.remove("no-scroll");
}

// Prevent touch scroll bleed
const overlayEl = document.querySelector(".detail-overlay-prime");
if(overlayEl){
  overlayEl.addEventListener("touchmove", e => e.stopPropagation(), {passive:false});
}

// ===== FIX: Fullscreen landscape =====
function goFullScreen(video){
  if (video.requestFullscreen) video.requestFullscreen();
  if (screen.orientation && screen.orientation.lock){
    screen.orientation.lock("landscape").catch(()=>{});
  }
  video.style.width = "100vw";
  video.style.height = "100vh";
  video.style.objectFit = "contain";
}

document.addEventListener("fullscreenchange", ()=>{
  if(!document.fullscreenElement){
    if(screen.orientation && screen.orientation.unlock){
      screen.orientation.unlock();
    }
  }
});
