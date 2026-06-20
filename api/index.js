const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

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

// -------------------------------------------------------------
// EMAIL (Nodemailer + Gmail) — used for password reset codes
// -------------------------------------------------------------
// Set these in Vercel → Settings → Environment Variables:
//   EMAIL_USER = your Gmail address
//   EMAIL_PASS = a Gmail App Password (NOT your normal password)
//   Generate one at: https://myaccount.google.com/apppasswords
//   (requires 2-Step Verification to be enabled on the Gmail account)
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

if (!EMAIL_USER || !EMAIL_PASS) {
  console.error('⚠️  EMAIL_USER / EMAIL_PASS environment variables are not set.');
  console.error('   Password reset emails will fail until these are configured.');
  console.error('   Go to your Vercel project → Settings → Environment Variables');
}

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

function generateResetCode() {
  // 6-digit numeric code, e.g. "042817"
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendResetCodeEmail(toEmail, code, name) {
  await transporter.sendMail({
    from: `"SkFlip" <${EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your SkFlip password reset code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#111">
        <h2 style="margin-bottom:4px">SkFlip</h2>
        <p>Hi ${name || 'there'},</p>
        <p>We received a request to reset your SkFlip password. Use the verification code below to continue:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f4f4f4;padding:16px 24px;border-radius:8px;text-align:center;margin:24px 0">${code}</div>
        <p>This code expires in <strong>10 minutes</strong>. If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `
  });
}

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
  role: { type: String, default: 'user', enum: ['user', 'admin'] },
  resetCode: { type: String },
  resetCodeExpiry: { type: Date }
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

// Wishlist Schema — stores per-user wishlist + offer claim state
const WishlistSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  movieIds:     [{ type: String }],
  offerClaimed: { type: Boolean, default: false }
}, { timestamps: true });

// Continue Watching — stores per-user playback progress (cross-device)
const ContinueItemSchema = new mongoose.Schema({
  movieId:     { type: String, required: true },
  title:       { type: String, default: '' },
  posterUrl:   { type: String, default: '' },
  backdropUrl: { type: String, default: '' },
  type:        { type: String, default: 'movie' },
  currentTime: { type: Number, default: 0 },
  duration:    { type: Number, default: 0 },
  updatedAt:   { type: Date, default: Date.now }
}, { _id: false });

const ContinueWatchingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  items:  [ContinueItemSchema]
}, { timestamps: true });

// Use existing model if already compiled (prevents OverwriteModelError in serverless)
const User     = mongoose.models.User     || mongoose.model('User',     UserSchema);
const Movie    = mongoose.models.Movie    || mongoose.model('Movie',    MovieSchema);
const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', WishlistSchema);
const ContinueWatching = mongoose.models.ContinueWatching || mongoose.model('ContinueWatching', ContinueWatchingSchema);

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
// JWT AUTH MIDDLEWARE (used on protected routes)
// -------------------------------------------------------------
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

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

// Forgot Password — Step 1: email a verification code
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ email });

    // Always return the same generic message whether or not the account
    // exists — this prevents leaking which emails are registered.
    const genericMessage = 'If an account exists for that email, a verification code has been sent.';

    if (!user) {
      return res.json({ message: genericMessage });
    }

    const code = generateResetCode();
    user.resetCode = code;
    user.resetCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    try {
      await sendResetCodeEmail(user.email, code, user.name);
    } catch (mailErr) {
      console.error('❌ Failed to send reset code email:', mailErr.message);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again in a moment.' });
    }

    res.json({ message: genericMessage });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Forgot Password — Step 2: verify the code and set a new password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email });
    if (!user || !user.resetCode || !user.resetCodeExpiry) {
      return res.status(400).json({ error: 'Invalid or expired verification code.' });
    }

    if (user.resetCodeExpiry < new Date()) {
      return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    if (user.resetCode !== code) {
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetCode = undefined;
    user.resetCodeExpiry = undefined;
    await user.save();

    res.json({ message: 'Password has been reset successfully. You can now sign in.' });
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
// WISHLIST ROUTES (Authenticated) — cross-device sync
// -------------------------------------------------------------

// GET  /api/wishlist  — fetch wishlist + offerClaimed for current user
app.get('/api/wishlist', requireAuth, async (req, res) => {
  try {
    let w = await Wishlist.findOne({ userId: req.user.id }).lean();
    if (!w) w = { movieIds: [], offerClaimed: false };
    res.json({ movieIds: w.movieIds || [], offerClaimed: w.offerClaimed || false });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/wishlist/toggle/:movieId  — add or remove a single movie
app.post('/api/wishlist/toggle/:movieId', requireAuth, async (req, res) => {
  try {
    const { movieId } = req.params;
    let w = await Wishlist.findOne({ userId: req.user.id });
    if (!w) w = new Wishlist({ userId: req.user.id, movieIds: [] });
    const idx = w.movieIds.indexOf(movieId);
    if (idx > -1) { w.movieIds.splice(idx, 1); }
    else           { w.movieIds.push(movieId); }
    await w.save();
    res.json({ movieIds: w.movieIds, added: idx === -1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT  /api/wishlist  — replace full wishlist (used for merging on login)
app.put('/api/wishlist', requireAuth, async (req, res) => {
  try {
    const { movieIds } = req.body;
    if (!Array.isArray(movieIds)) return res.status(400).json({ error: 'movieIds must be an array.' });
    const w = await Wishlist.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { movieIds } },
      { upsert: true, new: true }
    ).lean();
    res.json({ movieIds: w.movieIds });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/wishlist/claim  — mark the promotional offer as claimed
app.post('/api/wishlist/claim', requireAuth, async (req, res) => {
  try {
    const w = await Wishlist.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { offerClaimed: true } },
      { upsert: true, new: true }
    ).lean();
    res.json({ offerClaimed: w.offerClaimed });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// -------------------------------------------------------------
// CONTINUE WATCHING ROUTES (Authenticated) — per-user, cross-device
// -------------------------------------------------------------

// GET /api/continue-watching — fetch current user's in-progress list
app.get('/api/continue-watching', requireAuth, async (req, res) => {
  try {
    const cw = await ContinueWatching.findOne({ userId: req.user.id }).lean();
    res.json({ items: cw ? cw.items : [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/continue-watching — upsert progress for one title
// (most-recently-watched first, capped at 20 entries per user)
app.post('/api/continue-watching', requireAuth, async (req, res) => {
  try {
    const { movieId, title, posterUrl, backdropUrl, type, currentTime, duration } = req.body;
    if (!movieId) {
      return res.status(400).json({ error: 'movieId is required.' });
    }

    let cw = await ContinueWatching.findOne({ userId: req.user.id });
    if (!cw) cw = new ContinueWatching({ userId: req.user.id, items: [] });

    cw.items = cw.items.filter(it => it.movieId !== movieId);
    cw.items.unshift({
      movieId,
      title: title || '',
      posterUrl: posterUrl || '',
      backdropUrl: backdropUrl || '',
      type: type || 'movie',
      currentTime: Math.floor(currentTime) || 0,
      duration: Math.floor(duration) || 0,
      updatedAt: new Date()
    });
    cw.items = cw.items.slice(0, 20);

    await cw.save();
    res.json({ items: cw.items });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/continue-watching/:movieId — remove a single title (e.g. finished or dismissed)
app.delete('/api/continue-watching/:movieId', requireAuth, async (req, res) => {
  try {
    const cw = await ContinueWatching.findOneAndUpdate(
      { userId: req.user.id },
      { $pull: { items: { movieId: req.params.movieId } } },
      { new: true, upsert: true }
    ).lean();
    res.json({ items: cw ? cw.items : [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/continue-watching — clear the entire list ("Clear All")
app.delete('/api/continue-watching', requireAuth, async (req, res) => {
  try {
    await ContinueWatching.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { items: [] } },
      { upsert: true }
    );
    res.json({ items: [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
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


// ===== Added by ChatGPT =====
function handleOfferClaim(currentUser, openAuthModal, claimBtn){
    if(!currentUser){
        openAuthModal();
        return;
    }
    fetch('/api/wishlist/claim',{
        method:'POST',
        headers:{Authorization:`Bearer ${localStorage.getItem("token")}`}
    }).then(r=>r.json()).then(()=>{
        claimBtn.textContent='Claimed';
        claimBtn.disabled=true;
        claimBtn.classList.add('claimed');
    });
}

function handleSignOut(){
    const confirmed = confirm('Do you really want to sign out?');
    if(!confirmed) return false;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return true;
}
// ===== End Added =====
