// api/admin/upload.js
// Handles movie/thumbnail/video uploads via Cloudinary
const connectDB = require('../../lib/db');
const Movie = require('../../lib/models/Movie');
const { requireAdmin } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

// Cloudinary upload helper (raw fetch, no SDK needed in serverless)
async function uploadToCloudinary(base64Data, options = {}) {
  const { cloudName, apiKey, apiSecret } = {
    cloudName:  process.env.CLOUDINARY_CLOUD_NAME,
    apiKey:     process.env.CLOUDINARY_API_KEY,
    apiSecret:  process.env.CLOUDINARY_API_SECRET,
  };

  const formData = new URLSearchParams();
  formData.append('file', base64Data);
  formData.append('upload_preset', options.preset || 'skflip_movies');
  formData.append('resource_type', options.resourceType || 'image');
  if (options.folder) formData.append('folder', options.folder);

  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = require('crypto');
  const sigStr = `timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

  formData.append('timestamp', timestamp);
  formData.append('api_key', apiKey);
  formData.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${options.resourceType || 'image'}/upload`,
    { method: 'POST', body: formData }
  );
  return res.json();
}

module.exports = requireAdmin(async (req, res) => {
  if (setCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();

  try {
    const { type, data, movieId, field } = req.body;
    // type: 'poster' | 'backdrop' | 'video' | 'subtitle'
    // data: base64 string
    // movieId: existing movie to attach to
    // field: which field to update ('posterUrl', 'backdropUrl', 'videoUrl', 'hlsUrl')

    if (!data) return res.status(400).json({ error: 'No file data provided' });

    const resourceType = type === 'video' ? 'video' : 'image';
    const folder = `skflip/${type}s`;

    const result = await uploadToCloudinary(data, { resourceType, folder });

    if (!result.secure_url) {
      return res.status(500).json({ error: 'Upload failed', detail: result.error?.message });
    }

    // If movieId + field provided, update the movie document
    let movie = null;
    if (movieId && field) {
      movie = await Movie.findByIdAndUpdate(
        movieId,
        { [field]: result.secure_url, cloudinaryId: result.public_id },
        { new: true }
      );
    }

    return res.status(200).json({
      url:         result.secure_url,
      publicId:    result.public_id,
      duration:    result.duration,     // for videos
      format:      result.format,
      width:       result.width,
      height:      result.height,
      movie:       movie,
    });
  } catch (err) {
    console.error('[admin/upload]', err);
    return res.status(500).json({ error: 'Upload error: ' + err.message });
  }
});
