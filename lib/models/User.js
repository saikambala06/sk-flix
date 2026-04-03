// lib/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true, minlength: 6, select: false },
  avatar:     { type: String, default: '' },
  role:       { type: String, enum: ['user', 'admin'], default: 'user' },
  plan:       { type: String, enum: ['free', 'basic', 'premium'], default: 'free' },
  profiles:   [{ name: String, avatar: String, isKids: Boolean }],
  preferences: {
    genres:   [String],
    language: { type: String, default: 'en' },
    autoplay: { type: Boolean, default: true },
    subtitles: { type: Boolean, default: false },
  },
  createdAt:  { type: Date, default: Date.now },
  lastLogin:  { type: Date },
}, { timestamps: true });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Remove sensitive fields
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);
