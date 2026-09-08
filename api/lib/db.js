'use strict';

const mongoose = require('mongoose');

/**
 * Serverless-safe MongoDB connection.
 *
 * On Vercel, the module scope survives between warm invocations but not cold
 * starts. We cache the *promise* (not just a boolean flag) on globalThis so
 * that concurrent invocations on the same instance await the same connection
 * instead of racing to open several.
 */

const MONGODB_URI = process.env.MONGODB_URI;

let cache = globalThis.__skflipMongo;
if (!cache) {
  cache = globalThis.__skflipMongo = { conn: null, promise: null };
}

mongoose.set('strictQuery', true);

async function connectDB() {
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured on the server.');
  }

  // Reuse a live connection.
  if (cache.conn && mongoose.connection.readyState === 1) {
    return cache.conn;
  }

  // A connection attempt is already in flight — await it rather than starting another.
  if (!cache.promise) {
    cache.promise = mongoose
      .connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 45000,
        maxPoolSize: 5,
        minPoolSize: 0,
        retryWrites: true,
        w: 'majority',
        // Fail fast instead of silently queueing operations against a dead socket.
        bufferCommands: false,
      })
      .then((m) => {
        cache.conn = m;
        return m;
      })
      .catch((err) => {
        // Clear the promise so the next request can retry instead of
        // permanently caching a rejected promise.
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

mongoose.connection.on('disconnected', () => {
  cache.conn = null;
  cache.promise = null;
});

mongoose.connection.on('error', () => {
  cache.conn = null;
  cache.promise = null;
});

/** Express middleware: guarantee a DB connection before any route runs. */
async function ensureDB(req, res, next) {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection failed:', err.message);
    res.status(503).json({
      error: 'The service is temporarily unavailable. Please try again in a moment.',
      code: 'DB_UNAVAILABLE',
    });
  }
}

module.exports = { connectDB, ensureDB, mongoose };
