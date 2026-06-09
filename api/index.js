const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

// ============================================================
// CONFIGURATION
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const JWT_EXPIRES_IN = '7d';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const SALT_ROUNDS = 12;
const APP_VERSION = '2.0.0';

if (!MONGODB_URI) {
  console.error('❌ FATAL: MONGODB_URI environment variable is not set.');
  console.error('   Go to your Vercel project → Settings → Environment Variables');
  console.error('   Add MONGODB_URI = mongodb+srv://user:pass@cluster.mongodb.net/skflip');
}

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ WARNING: JWT_SECRET not set in env. Using random secret.');
  console.warn('   Tokens will invalidate on every serverless cold start!');
  console.warn('   Add JWT_SECRET to your Vercel environment variables.');
}

// ============================================================
// SECURITY MIDDLEWARE (Helmet-style, zero dependencies)
// ============================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-API-Version', APP_VERSION);
  res.removeHeader('X-Powered-By');
  next();
});

// ============================================================
// CORS
// ============================================================
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // Preflight cache for 24h
}));

// ============================================================
// BODY PARSING
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================
// REQUEST LOGGING
// ============================================================
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const emoji = status < 400 ? '✅' : status < 500 ? '⚠️' : '❌';
    console.log(`${emoji} ${req.method} ${req.originalUrl} → ${status} (${duration}ms)`);
  });
  next();
});

// ============================================================
// NOSQL INJECTION SANITIZATION
// ============================================================
function sanitizeDeep(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (typeof key === 'string' && key.startsWith('$')) {
      delete obj[key];
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeDeep(obj[key]);
    }
  }
}

app.use((req, res, next) => {
  sanitizeDeep(req.body);
  sanitizeDeep(req.query);
  sanitizeDeep(req.params);
  next();
});

// ============================================================
// RATE LIMITING
// Note: In Vercel serverless, each cold start gets a fresh
// in-memory store. For production, use Redis-backed rate limiting.
// This still protects against bursts within a single invocation.
// ============================================================
const rateLimitStore = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 120;
const AUTH_RATE_LIMIT_MAX = 15; // Stricter for auth routes

function rateLimit(maxRequests = RATE_LIMIT_MAX) {
  return (req, res, next) => {
    if (req.path === '/api/health') return next();

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.connection?.remoteAddress
      || 'unknown';
    const key = `${ip}:${req.method}:${req.path}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
      rateLimitStore.set(key, record);
    } else {
      record.count++;
    }

    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        code: 'RATE_LIMITED',
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now > record.resetTime + 60000) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

app.use(rateLimit());

// ============================================================
// MONGODB CONNECTION
// ============================================================
let isConnected = false;
let isConnecting = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;

  if (isConnecting) {
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (isConnected && mongoose.connection.readyState === 1) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(check);
        reject(new Error('DB connection wait timeout'));
      }, 15000);
    });
  }

  isConnecting = true;

  try {
    if (mongoose.connection.readyState !== 0) {
      try { await mongoose.disconnect(); } catch (e) { /* ignore stale connection */ }
    }

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      maxPoolSize: 5,
      minPoolSize: 1,
      retryWrites: true,
      w: 'majority',
      bufferCommands: false,
    });

    isConnected = true;
    isConnecting = false;
    console.log('✅ MongoDB Connected');

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

    if (err.message.includes('authentication failed') || err.message.includes('bad auth')) {
      console.error('   → Wrong username or password in your connection string');
    } else if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('   → Cluster hostname not found — check your connection string');
    } else if (err.message.includes('timeout') || err.message.includes('timed out')) {
      console.error('   → Connection timed out — check your IP whitelist in MongoDB Atlas');
    }
  }
}

// ============================================================
// DATABASE SCHEMAS
// ============================================================

// --- User Schema ---
const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 6,
    select: false // Never included in queries unless explicitly requested
  },
  role: {
    type: String,
    default: 'user',
    enum: ['user', 'admin']
  },
  avatar: { type: String, default: '' },
  bio: { type: String, maxlength: 500, default: '' },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  refreshToken: { type: String }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.refreshToken;
      delete ret.__v;
      return ret;
    }
  }
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
    next();
  } catch (err) {
    next(err);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// --- Episode Schema ---
const EpisodeSchema = new mongoose.Schema({
  season: { type: Number, default: 1, min: 1 },
  episodeNumber: { type: Number, required: true, min: 1 },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  thumbnailUrl: { type: String, trim: true },
  videoUrl: { type: String, trim: true },
  hlsUrl: { type: String, trim: true },
  duration: { type: Number, min: 0 },
  airDate: { type: String }
}, { _id: false });

// --- Movie Schema ---
const MovieSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 300
  },
  slug: { type: String, unique: true, sparse: true },
  type: {
    type: String,
    enum: ['movie', 'series', 'original'],
    default: 'movie',
    index: true
  },
  releaseYear: { type: Number, min: 1888, max: 2030 },
  rating: { type: String, trim: true },
  userRating: { type: Number, default: 0, min: 0, max: 10 },
  ratingCount: { type: Number, default: 0, min: 0 },
  genres: { type: [String], index: true },
  description: { type: String, trim: true, maxlength: 5000 },
  posterUrl: { type: String, trim: true },
  backdropUrl: { type: String, trim: true },
  hlsUrl: { type: String, trim: true },
  videoUrl: { type: String, trim: true },
  duration: { type: Number, min: 0 },
  episodes: [EpisodeSchema],
  episodeCount: { type: Number, default: 0 },
  seasonCount: { type: Number, default: 1 },
  audioLanguages: [String],
  subtitleLanguages: [String],
  cast: [String],
  director: { type: String, trim: true },
  isPublished: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false },
  viewCount: { type: Number, default: 0, min: 0 },
  tags: [String]
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Text index for full-text search
MovieSchema.index({ title: 'text', description: 'text', tags: 'text', cast: 'text' });

// --- Watchlist Schema ---
const WatchlistSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true }
}, { timestamps: true });

WatchlistSchema.index({ userId: 1, movieId: 1 }, { unique: true });

// --- Watch History Schema ---
const WatchHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  episodeSeason: { type: Number },
  episodeNumber: { type: Number },
  lastWatched: { type: Date, default: Date.now }
}, { timestamps: true });

WatchHistorySchema.index({ userId: 1, movieId: 1 });
WatchHistorySchema.index({ userId: 1, lastWatched: -1 });

// --- Review Schema ---
const ReviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  movieId: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },
  rating: { type: Number, required: true, min: 1, max: 10 },
  title: { type: String, trim: true, maxlength: 200 },
  content: { type: String, trim: true, maxlength: 2000 },
  isSpoiler: { type: Boolean, default: false }
}, { timestamps: true });

ReviewSchema.index({ userId: 1, movieId: 1 }, { unique: true });

// --- Compile Models (safe for serverless hot-reload) ---
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Movie = mongoose.models.Movie || mongoose.model('Movie', MovieSchema);
const Watchlist = mongoose.models.Watchlist || mongoose.model('Watchlist', WatchlistSchema);
const WatchHistory = mongoose.models.WatchHistory || mongoose.model('WatchHistory', WatchHistorySchema);
const Review = mongoose.models.Review || mongoose.model('Review', ReviewSchema);

// ============================================================
// HELPER FUNCTIONS
// ============================================================
const validateEmail = (email) => /^\S+@\S+\.\S+$/.test(email);
const validateObjectId = (id) => mongoose.Types.ObjectId.isValid(id) && /^[0-9a-fA-F]{24}$/.test(id);

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>'"]/g, (char) => ({
    '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function sanitizeMovieInput(data) {
  const sanitized = { ...data };
  if (sanitized.title) sanitized.title = sanitizeString(sanitized.title.trim());
  if (sanitized.description) sanitized.description = sanitizeString(sanitized.description.trim());
  if (sanitized.director) sanitized.director = sanitizeString(sanitized.director.trim());
  if (sanitized.rating) sanitized.rating = sanitizeString(sanitized.rating.trim());
  return sanitized;
}

function generateSlug(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

// ============================================================
// DATABASE CONNECTION MIDDLEWARE
// ============================================================
async function ensureDB(req, res, next) {
  if (!isConnected || mongoose.connection.readyState !== 1) {
    await connectDB();
  }
  if (!isConnected || mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      error: 'Service temporarily unavailable. Please try again in a moment.',
      code: 'DB_UNAVAILABLE'
    });
  }
  next();
}

app.use(ensureDB);

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required. Please log in.',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        error: 'Invalid authentication token format.',
        code: 'NO_TOKEN'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Session expired. Please log in again.',
        code: 'TOKEN_EXPIRED'
      });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid authentication token.',
        code: 'INVALID_TOKEN'
      });
    }
    return res.status(401).json({
      error: 'Authentication failed.',
      code: 'AUTH_FAILED'
    });
  }
}

function authorizeAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required for this action.',
      code: 'FORBIDDEN'
    });
  }
  next();
}

// Convenience: require both auth + admin
const requireAdmin = [authenticate, authorizeAdmin];

// ============================================================
// AUTHENTICATION ROUTES
// ============================================================

// @route   POST /api/auth/signup
// @desc    Register a new user
// @access  Public
app.post('/api/auth/signup', rateLimit(AUTH_RATE_LIMIT_MAX), async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // --- Validation ---
    const errors = [];
    if (!name || !name.trim()) errors.push('Name is required.');
    if (!email || !email.trim()) errors.push('Email is required.');
    if (!password) errors.push('Password is required.');

    if (errors.length > 0) {
      return res.status(400).json({ error: errors.join(' '), code: 'MISSING_FIELDS' });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({ error: 'Name must be under 100 characters.' });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address.', code: 'INVALID_EMAIL' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.', code: 'WEAK_PASSWORD' });
    }

    if (password.length > 128) {
      return res.status(400).json({ error: 'Password must be under 128 characters.' });
    }

    // --- Check existing user ---
    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
        code: 'EMAIL_EXISTS'
      });
    }

    // --- Create user ---
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'admin' : 'user'; // First user is admin

    const user = await User.create({
      name: sanitizeString(name.trim()),
      email: email.toLowerCase().trim(),
      password, // Pre-save hook will hash it
      role
    });

    // --- Generate token ---
    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
        code: 'EMAIL_EXISTS'
      });
    }
    console.error('❌ Signup error:', error.message);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
// @access  Public
app.post('/api/auth/login', rateLimit(AUTH_RATE_LIMIT_MAX), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({
      email: email.toLowerCase().trim()
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        error: 'Your account has been deactivated. Contact support.',
        code: 'ACCOUNT_DISABLED'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Invalid email or password.',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login (non-blocking)
    User.findByIdAndUpdate(user._id, { lastLogin: new Date() }).exec().catch(() => {});

    const token = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || '',
        lastLogin: new Date()
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// @route   GET /api/auth/me
// @desc    Get current authenticated user
// @access  Private
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    // password & refreshToken excluded by schema select:false and toJSON transform
    res.json({ user });
  } catch (error) {
    console.error('❌ Get profile error:', error.message);
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
app.put('/api/auth/profile', authenticate, async (req, res) => {
  try {
    const { name, avatar, bio } = req.body;
    const updateFields = {};

    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
      if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be under 100 characters.' });
      updateFields.name = sanitizeString(name.trim());
    }
    if (avatar !== undefined) {
      updateFields.avatar = avatar.trim();
    }
    if (bio !== undefined) {
      if (bio.length > 500) return res.status(400).json({ error: 'Bio must be under 500 characters.' });
      updateFields.bio = sanitizeString(bio.trim());
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('❌ Profile update error:', error.message);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// @route   PUT /api/auth/change-password
// @desc    Change user password
// @access  Private
app.put('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    if (newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be under 128 characters.' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect.', code: 'WRONG_PASSWORD' });
    }

    user.password = newPassword; // Pre-save hook will hash it
    await user.save();

    res.json({ message: 'Password changed successfully.' });
  } catch (error) {
    console.error('❌ Password change error:', error.message);
    res.status(500).json({ error: 'Failed to change password.' });
  }
});

// ============================================================
// CONTENT ROUTES (Public)
// ============================================================

// @route   GET /api/movies
// @desc    Get all published movies with search, filter, pagination
// @access  Public
app.get('/api/movies', async (req, res) => {
  try {
    const {
      type,
      genre,
      year,
      search,
      sort = 'newest',
      page = 1,
      limit = 20,
      featured,
      trending
    } = req.query;

    const query = { isPublished: true };

    // --- Filters ---
    if (type) {
      const validTypes = ['movie', 'series', 'original'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: 'Invalid type. Use: movie, series, or original.' });
      }
      query.type = type;
    }

    if (genre) {
      query.genres = { $in: [genre] };
    }

    if (year) {
      const yearNum = parseInt(year);
      if (isNaN(yearNum) || yearNum < 1888 || yearNum > 2030) {
        return res.status(400).json({ error: 'Invalid year.' });
      }
      query.releaseYear = yearNum;
    }

    if (featured === 'true') {
      query.isFeatured = true;
    }

    if (trending === 'true') {
      query.isTrending = true;
    }

    // --- Search ---
    let sortOptions = {};
    const searchProjection = {};

    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
      searchProjection.score = { $meta: 'textScore' };
      sortOptions.score = { $meta: 'textScore' };
    }

    // --- Sorting ---
    switch (sort) {
      case 'oldest':
        sortOptions = { ...sortOptions, releaseYear: 1 };
        break;
      case 'newest':
        sortOptions = { ...sortOptions, createdAt: -1 };
        break;
      case 'rating':
        sortOptions = { ...sortOptions, userRating: -1 };
        break;
      case 'popular':
        sortOptions = { ...sortOptions, viewCount: -1 };
        break;
      case 'title_asc':
        sortOptions = { ...sortOptions, title: 1 };
        break;
      case 'title_desc':
        sortOptions = { ...sortOptions, title: -1 };
        break;
      default:
        sortOptions = { ...sortOptions, createdAt: -1 };
    }

    // --- Pagination ---
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const [movies, total] = await Promise.all([
      Movie.find(query, searchProjection)
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .select('-episodes') // Don't send episodes in list view (too heavy)
        .lean(),
      Movie.countDocuments(query)
    ]);

    res.json({
      movies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
        hasMore: pageNum < Math.ceil(total / limitNum)
      },
      filters: { type: type || null, genre: genre || null, year: year || null, search: search || null, sort }
    });
  } catch (error) {
    console.error('❌ Movies fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch content.' });
  }
});

// @route   GET /api/genres
// @desc    Get all available genres
// @access  Public
app.get('/api/genres', async (req, res) => {
  try {
    const genres = await Movie.distinct('genres', { isPublished: true });
    res.json({ genres: genres.filter(Boolean).sort() });
  } catch (error) {
    console.error('❌ Genres fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch genres.' });
  }
});

// @route   GET /api/featured
// @desc    Get featured content
// @access  Public
app.get('/api/featured', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const movies = await Movie.find({ isPublished: true, isFeatured: true })
      .sort({ createdAt: -1 })
      .limit(Math.min(20, Math.max(1, parseInt(limit))))
      .select('-episodes')
      .lean();
    res.json({ movies, total: movies.length });
  } catch (error) {
    console.error('❌ Featured fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch featured content.' });
  }
});

// @route   GET /api/trending
// @desc    Get trending content
// @access  Public
app.get('/api/trending', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const movies = await Movie.find({ isPublished: true, isTrending: true })
      .sort({ viewCount: -1, createdAt: -1 })
      .limit(Math.min(20, Math.max(1, parseInt(limit))))
      .select('-episodes')
      .lean();
    res.json({ movies, total: movies.length });
  } catch (error) {
    console.error('❌ Trending fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch trending content.' });
  }
});

// @route   GET /api/movies/:id
// @desc    Get single movie by ID (with reviews)
// @access  Public
app.get('/api/movies/:id', async (req, res) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid content ID format.' });
    }

    const movie = await Movie.findById(req.params.id).lean();
    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    // Increment view count (non-blocking, fire-and-forget)
    Movie.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } }).exec().catch(() => {});

    // Get top reviews
    const reviews = await Review.find({ movieId: req.params.id })
      .populate('userId', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ ...movie, reviews });
  } catch (error) {
    console.error('❌ Movie fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch content.' });
  }
});

// ============================================================
// WATCHLIST ROUTES (Authenticated)
// ============================================================

// @route   GET /api/watchlist
// @desc    Get user's watchlist
// @access  Private
app.get('/api/watchlist', authenticate, async (req, res) => {
  try {
    const watchlist = await Watchlist.find({ userId: req.user.id })
      .populate('movieId', 'title type posterUrl backdropUrl releaseYear rating userRating genres duration')
      .sort({ createdAt: -1 })
      .lean();

    const movies = watchlist
      .filter(item => item.movieId) // Skip if movie was deleted
      .map(item => ({
        ...item.movieId,
        addedAt: item.createdAt,
        watchlistId: item._id
      }));

    res.json({ movies, total: movies.length });
  } catch (error) {
    console.error('❌ Watchlist fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch watchlist.' });
  }
});

// @route   POST /api/watchlist/:movieId
// @desc    Add movie to watchlist
// @access  Private
app.post('/api/watchlist/:movieId', authenticate, async (req, res) => {
  try {
    const { movieId } = req.params;

    if (!validateObjectId(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID.' });
    }

    const movie = await Movie.findById(movieId).select('title').lean();
    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    const existing = await Watchlist.findOne({ userId: req.user.id, movieId });
    if (existing) {
      return res.status(409).json({
        error: 'Already in your watchlist.',
        code: 'ALREADY_IN_WATCHLIST'
      });
    }

    await Watchlist.create({ userId: req.user.id, movieId });

    res.status(201).json({
      message: `"${movie.title}" added to your watchlist.`,
      movieId
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Already in your watchlist.' });
    }
    console.error('❌ Watchlist add error:', error.message);
    res.status(500).json({ error: 'Failed to add to watchlist.' });
  }
});

// @route   DELETE /api/watchlist/:movieId
// @desc    Remove movie from watchlist
// @access  Private
app.delete('/api/watchlist/:movieId', authenticate, async (req, res) => {
  try {
    const result = await Watchlist.findOneAndDelete({
      userId: req.user.id,
      movieId: req.params.movieId
    });

    if (!result) {
      return res.status(404).json({ error: 'Not found in your watchlist.' });
    }

    res.json({ message: 'Removed from your watchlist.' });
  } catch (error) {
    console.error('❌ Watchlist remove error:', error.message);
    res.status(500).json({ error: 'Failed to remove from watchlist.' });
  }
});

// @route   GET /api/watchlist/check/:movieId
// @desc    Check if movie is in user's watchlist
// @access  Private
app.get('/api/watchlist/check/:movieId', authenticate, async (req, res) => {
  try {
    const exists = await Watchlist.exists({
      userId: req.user.id,
      movieId: req.params.movieId
    });
    res.json({ inWatchlist: !!exists });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check watchlist.' });
  }
});

// ============================================================
// WATCH HISTORY ROUTES (Authenticated)
// ============================================================

// @route   GET /api/history
// @desc    Get user's watch history (continue watching)
// @access  Private
app.get('/api/history', authenticate, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const history = await WatchHistory.find({ userId: req.user.id })
      .populate('movieId', 'title type posterUrl backdropUrl duration')
      .sort({ lastWatched: -1 })
      .limit(Math.min(50, Math.max(1, parseInt(limit))))
      .lean();

    const items = history.filter(item => item.movieId);

    res.json({ history: items, total: items.length });
  } catch (error) {
    console.error('❌ History fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch watch history.' });
  }
});

// @route   POST /api/history/:movieId
// @desc    Update watch progress (upsert)
// @access  Private
app.post('/api/history/:movieId', authenticate, async (req, res) => {
  try {
    const { movieId } = req.params;
    const { progress, episodeSeason, episodeNumber } = req.body;

    if (!validateObjectId(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID.' });
    }

    const updateData = {
      progress: Math.min(100, Math.max(0, progress || 0)),
      lastWatched: new Date()
    };

    if (episodeSeason !== undefined) updateData.episodeSeason = episodeSeason;
    if (episodeNumber !== undefined) updateData.episodeNumber = episodeNumber;

    const result = await WatchHistory.findOneAndUpdate(
      { userId: req.user.id, movieId },
      { $set: updateData },
      { upsert: true, new: true }
    );

    res.json({ history: result });
  } catch (error) {
    console.error('❌ History update error:', error.message);
    res.status(500).json({ error: 'Failed to update watch history.' });
  }
});

// @route   DELETE /api/history/:movieId
// @desc    Remove single item from history
// @access  Private
app.delete('/api/history/:movieId', authenticate, async (req, res) => {
  try {
    await WatchHistory.findOneAndDelete({
      userId: req.user.id,
      movieId: req.params.movieId
    });
    res.json({ message: 'Removed from watch history.' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove from history.' });
  }
});

// @route   DELETE /api/history
// @desc    Clear all watch history
// @access  Private
app.delete('/api/history', authenticate, async (req, res) => {
  try {
    const result = await WatchHistory.deleteMany({ userId: req.user.id });
    res.json({ message: `Cleared ${result.deletedCount} history items.` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear history.' });
  }
});

// ============================================================
// REVIEW ROUTES
// ============================================================

// @route   GET /api/movies/:movieId/reviews
// @desc    Get reviews for a movie (public)
// @access  Public
app.get('/api/movies/:movieId/reviews', async (req, res) => {
  try {
    const { page = 1, limit = 10, sort = 'newest' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let sortOptions = { createdAt: -1 };
    if (sort === 'rating_high') sortOptions = { rating: -1, createdAt: -1 };
    if (sort === 'rating_low') sortOptions = { rating: 1, createdAt: -1 };

    const [reviews, total] = await Promise.all([
      Review.find({ movieId: req.params.movieId })
        .populate('userId', 'name avatar')
        .sort(sortOptions)
        .skip(skip)
        .limit(Math.min(50, Math.max(1, parseInt(limit))))
        .lean(),
      Review.countDocuments({ movieId: req.params.movieId })
    ]);

    res.json({
      reviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Reviews fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch reviews.' });
  }
});

// @route   POST /api/movies/:movieId/reviews
// @desc    Create or update a review
// @access  Private
app.post('/api/movies/:movieId/reviews', authenticate, async (req, res) => {
  try {
    const { rating, title, content, isSpoiler } = req.body;
    const { movieId } = req.params;

    if (!validateObjectId(movieId)) {
      return res.status(400).json({ error: 'Invalid movie ID.' });
    }

    if (!rating || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be between 1 and 10.' });
    }

    const movie = await Movie.findById(movieId).select('_id title').lean();
    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    // Upsert: one review per user per movie
    const review = await Review.findOneAndUpdate(
      { userId: req.user.id, movieId },
      {
        rating: Math.round(rating * 10) / 10,
        title: title ? sanitizeString(title.trim()) : undefined,
        content: content ? sanitizeString(content.trim()) : undefined,
        isSpoiler: Boolean(isSpoiler)
      },
      { upsert: true, new: true, runValidators: true }
    );

    // Recalculate movie's aggregate rating
    const stats = await Review.aggregate([
      { $match: { movieId: new mongoose.Types.ObjectId(movieId) } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    if (stats.length > 0) {
      await Movie.findByIdAndUpdate(movieId, {
        userRating: Math.round(stats[0].avgRating * 10) / 10,
        ratingCount: stats[0].count
      });
    }

    res.status(201).json({ review });
  } catch (error) {
    console.error('❌ Review create error:', error.message);
    res.status(500).json({ error: 'Failed to submit review.' });
  }
});

// @route   DELETE /api/movies/:movieId/reviews
// @desc    Delete user's review for a movie
// @access  Private
app.delete('/api/movies/:movieId/reviews', authenticate, async (req, res) => {
  try {
    const review = await Review.findOneAndDelete({
      userId: req.user.id,
      movieId: req.params.movieId
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    // Recalculate movie rating after deletion
    const stats = await Review.aggregate([
      { $match: { movieId: new mongoose.Types.ObjectId(req.params.movieId) } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    await Movie.findByIdAndUpdate(req.params.movieId, {
      userRating: stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0,
      ratingCount: stats.length > 0 ? stats[0].count : 0
    });

    res.json({ message: 'Review deleted.' });
  } catch (error) {
    console.error('❌ Review delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete review.' });
  }
});

// ============================================================
// ADMIN ROUTES (Protected — requires auth + admin role)
// ============================================================

// @route   POST /api/movies
// @desc    Add new content
// @access  Admin
app.post('/api/movies', ...requireAdmin, async (req, res) => {
  try {
    const data = sanitizeMovieInput(req.body);

    if (!data.title || !data.title.trim()) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    // Auto-generate slug
    data.slug = generateSlug(data.title);

    // Ensure slug is unique
    const existingSlug = await Movie.exists({ slug: data.slug });
    if (existingSlug) {
      data.slug = `${data.slug}-${Date.now().toString(36)}`;
    }

    const movie = await Movie.create(data);
    res.status(201).json(movie);
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'field';
      return res.status(409).json({
        error: `A movie with this ${field} already exists.`,
        code: 'DUPLICATE_KEY'
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('. '), code: 'VALIDATION_ERROR' });
    }
    console.error('❌ Create movie error:', error.message);
    res.status(500).json({ error: 'Failed to create content.' });
  }
});

// @route   PUT /api/movies/:id
// @desc    Update content
// @access  Admin
app.put('/api/movies/:id', ...requireAdmin, async (req, res) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid content ID.' });
    }

    const data = sanitizeMovieInput(req.body);

    // Don't allow changing _id
    delete data._id;

    // Update slug if title changed
    if (data.title) {
      data.slug = generateSlug(data.title);
      const existingSlug = await Movie.exists({ slug: data.slug, _id: { $ne: req.params.id } });
      if (existingSlug) {
        data.slug = `${data.slug}-${Date.now().toString(36)}`;
      }
    }

    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      { $set: data },
      { new: true, runValidators: true }
    ).lean();

    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    res.json(movie);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Duplicate slug. Title might already exist.' });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join('. ') });
    }
    console.error('❌ Update movie error:', error.message);
    res.status(500).json({ error: 'Failed to update content.' });
  }
});

// @route   DELETE /api/movies/:id
// @desc    Delete content and all related data
// @access  Admin
app.delete('/api/movies/:id', ...requireAdmin, async (req, res) => {
  try {
    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid content ID.' });
    }

    const movie = await Movie.findByIdAndDelete(req.params.id).lean();
    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    // Cascade delete all related data
    await Promise.all([
      Watchlist.deleteMany({ movieId: req.params.id }),
      WatchHistory.deleteMany({ movieId: req.params.id }),
      Review.deleteMany({ movieId: req.params.id })
    ]);

    res.json({
      message: `"${movie.title}" has been deleted along with all related data.`,
      deleted: { _id: movie._id, title: movie.title, type: movie.type }
    });
  } catch (error) {
    console.error('❌ Delete movie error:', error.message);
    res.status(500).json({ error: 'Failed to delete content.' });
  }
});

// @route   PATCH /api/movies/:id/toggle
// @desc    Toggle featured/trending/published status
// @access  Admin
app.patch('/api/movies/:id/toggle', ...requireAdmin, async (req, res) => {
  try {
    const { field } = req.body; // 'isFeatured', 'isTrending', 'isPublished'

    const allowedFields = ['isFeatured', 'isTrending', 'isPublished'];
    if (!field || !allowedFields.includes(field)) {
      return res.status(400).json({
        error: `Field must be one of: ${allowedFields.join(', ')}`
      });
    }

    const movie = await Movie.findById(req.params.id);
    if (!movie) {
      return res.status(404).json({ error: 'Content not found.' });
    }

    movie[field] = !movie[field];
    await movie.save();

    res.json({
      message: `"${movie.title}" ${field} set to ${movie[field]}.`,
      [field]: movie[field]
    });
  } catch (error) {
    console.error('❌ Toggle error:', error.message);
    res.status(500).json({ error: 'Failed to toggle status.' });
  }
});

// @route   GET /api/admin/stats
// @desc    Get dashboard statistics
// @access  Admin
app.get('/api/admin/stats', ...requireAdmin, async (req, res) => {
  try {
    const [
      totalMovies, totalSeries, totalOriginals, totalUsers, totalContent,
      totalReviews, totalWatchlistItems, publishedContent, featuredContent,
      recentUsers
    ] = await Promise.all([
      Movie.countDocuments({ type: 'movie' }),
      Movie.countDocuments({ type: 'series' }),
      Movie.countDocuments({ type: 'original' }),
      User.countDocuments(),
      Movie.countDocuments(),
      Review.countDocuments(),
      Watchlist.countDocuments(),
      Movie.countDocuments({ isPublished: true }),
      Movie.countDocuments({ isFeatured: true }),
      User.find()
        .select('name email role isActive lastLogin createdAt')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean()
    ]);

    // Top rated content
    const topRated = await Movie.find({ isPublished: true, userRating: { $gt: 0 } })
      .sort({ userRating: -1, ratingCount: -1 })
      .limit(5)
      .select('title type userRating ratingCount posterUrl')
      .lean();

    // Most watched content
    const mostWatched = await Movie.find({ isPublished: true, viewCount: { $gt: 0 } })
      .sort({ viewCount: -1 })
      .limit(5)
      .select('title type viewCount posterUrl')
      .lean();

    // Genre distribution
    const genreStats = await Movie.aggregate([
      { $match: { isPublished: true } },
      { $unwind: '$genres' },
      { $group: { _id: '$genres', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      overview: {
        totalMovies,
        totalSeries,
        totalOriginals,
        totalContent,
        totalUsers,
        totalReviews,
        totalWatchlistItems,
        publishedContent,
        unpublishedContent: totalContent - publishedContent,
        featuredContent
      },
      topRated,
      mostWatched,
      genreStats: genreStats.map(g => ({ genre: g._id, count: g.count })),
      recentUsers
    });
  } catch (error) {
    console.error('❌ Stats error:', error.message);
    res.status(500).json({ error: 'Failed to fetch statistics.' });
  }
});

// @route   GET /api/admin/movies
// @desc    Get all content for admin table (includes unpublished)
// @access  Admin
app.get('/api/admin/movies', ...requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, type, published } = req.query;
    const query = {};

    if (search && search.trim()) {
      query.$text = { $search: search.trim() };
    }
    if (type) query.type = type;
    if (published === 'true') query.isPublished = true;
    if (published === 'false') query.isPublished = false;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [movies, total] = await Promise.all([
      Movie.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .select('-episodes') // Don't send full episodes in table view
        .lean(),
      Movie.countDocuments(query)
    ]);

    res.json({
      movies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Admin movies error:', error.message);
    res.status(500).json({ error: 'Failed to fetch content.' });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users for admin management
// @access  Admin
app.get('/api/admin/users', ...requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 25, search, role } = req.query;
    const query = {};

    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { email: { $regex: search.trim(), $options: 'i' } }
      ];
    }
    if (role) query.role = role;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshToken')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      User.countDocuments(query)
    ]);

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Admin users error:', error.message);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user role
// @access  Admin
app.put('/api/admin/users/:id', ...requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be "user" or "admin".' });
    }

    // Prevent admin from demoting themselves
    if (req.params.id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot change your own role.' });
    }

    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true, runValidators: true }
    ).select('-password -refreshToken').lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json(user);
  } catch (error) {
    console.error('❌ User role update error:', error.message);
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// @route   PATCH /api/admin/users/:id/status
// @desc    Activate/deactivate user
// @access  Admin
app.patch('/api/admin/users/:id/status', ...requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own active status.' });
    }

    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: isActive !== undefined ? Boolean(isActive) : true },
      { new: true }
    ).select('-password -refreshToken').lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      message: `User ${user.email} has been ${user.isActive ? 'activated' : 'deactivated'}.`,
      user
    });
  } catch (error) {
    console.error('❌ User status update error:', error.message);
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// @route   DELETE /api/admin/users/:id
// @desc    Delete a user and all their data
// @access  Admin
app.delete('/api/admin/users/:id', ...requireAdmin, async (req, res) => {
  try {
    // Prevent admin from deleting themselves
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    if (!validateObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user ID.' });
    }

    const user = await User.findByIdAndDelete(req.params.id)
      .select('-password -refreshToken')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Clean up all user's related data
    await Promise.all([
      Watchlist.deleteMany({ userId: req.params.id }),
      WatchHistory.deleteMany({ userId: req.params.id }),
      Review.deleteMany({ userId: req.params.id })
    ]);

    res.json({
      message: `User "${user.email}" and all their data have been deleted.`
    });
  } catch (error) {
    console.error('❌ User delete error:', error.message);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStateText = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState];

  res.json({
    status: dbState === 1 ? 'ok' : 'degraded',
    version: APP_VERSION,
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      state: dbState,
      stateText: dbStateText,
      name: mongoose.connection.name || 'not_connected'
    },
    environment: process.env.NODE_ENV || 'production'
  });
});

// ============================================================
// API 404 HANDLER
// ============================================================
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found.',
    code: 'NOT_FOUND',
    path: req.originalUrl,
    method: req.method,
    availableVersions: [APP_VERSION]
  });
});

// ============================================================
// GLOBAL ERROR HANDLER
// ============================================================
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled Error:', {
    message: err.message,
    path: req.originalUrl,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: messages.join('. '),
      code: 'VALIDATION_ERROR',
      fields: Object.keys(err.errors)
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: `Invalid ${err.path}: ${err.value}`,
      code: 'INVALID_ID'
    });
  }

  // Duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'field';
    return res.status(409).json({
      error: `Duplicate value for ${field}. This ${field} already exists.`,
      code: 'DUPLICATE_KEY'
    });
  }

  // JSON parse error
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON in request body.',
      code: 'INVALID_JSON'
    });
  }

  // Payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body too large. Maximum size is 10MB.',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }

  // Default: Internal server error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error.' : err.message,
    code: 'INTERNAL_ERROR',
    ...(process.env.NODE_ENV === 'development' && {
      details: err.message,
      stack: err.stack
    })
  });
});

// ============================================================
// EXPORT FOR VERCEL SERVERLESS
// ============================================================
module.exports = app;
