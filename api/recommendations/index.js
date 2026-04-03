// api/recommendations/index.js
// AI-powered recommendation engine using Claude + collaborative filtering signals
const connectDB = require('../../lib/db');
const WatchHistory = require('../../lib/models/WatchHistory');
const Movie = require('../../lib/models/Movie');
const { requireAuth } = require('../../lib/middleware/auth');
const setCors = require('../../lib/cors');

module.exports = requireAuth(async (req, res, tokenUser) => {
  if (setCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  await connectDB();
  const userId = tokenUser.userId;

  try {
    // 1. Gather user signals
    const history = await WatchHistory.find({ userId })
      .sort({ lastWatchedAt: -1 })
      .limit(50)
      .populate('movieId', 'title genres type rating');

    const watchedIds = history.map(h => h.movieId?._id).filter(Boolean);

    // Build genre affinity scores
    const genreScores = {};
    history.forEach(h => {
      if (!h.movieId) return;
      const weight = h.liked === true ? 3 : h.completed ? 2 : h.addedToList ? 1.5 : 1;
      (h.movieId.genres || []).forEach(g => {
        genreScores[g] = (genreScores[g] || 0) + weight;
      });
    });

    const topGenres = Object.entries(genreScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g);

    // 2. Use Claude AI to refine recommendations
    let aiSuggestions = null;
    if (process.env.ANTHROPIC_API_KEY && history.length > 0) {
      try {
        const watchedTitles = history.slice(0, 10).map(h => ({
          title: h.movieId?.title,
          genres: h.movieId?.genres,
          completed: h.completed,
          liked: h.liked,
        })).filter(t => t.title);

        const prompt = `You are a streaming recommendation engine.

User's watch history (most recent first):
${JSON.stringify(watchedTitles, null, 2)}

Top genres by engagement: ${topGenres.join(', ')}

Based on this viewing behavior, generate 3 specific content recommendation categories with reasoning.
Respond ONLY with valid JSON — no markdown, no explanation:
{
  "categories": [
    { "label": "string", "reason": "string", "genres": ["string"], "mood": "string" },
    { "label": "string", "reason": "string", "genres": ["string"], "mood": "string" },
    { "label": "string", "reason": "string", "genres": ["string"], "mood": "string" }
  ],
  "topPick": { "reason": "string", "genres": ["string"] }
}`;

        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 600,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        const aiData = await aiRes.json();
        const text = aiData.content?.[0]?.text || '';
        aiSuggestions = JSON.parse(text.replace(/```json|```/g, '').trim());
      } catch (e) {
        console.warn('[recommendations] AI step failed:', e.message);
      }
    }

    // 3. Fetch recommended movies from DB
    const recommendedGenres = aiSuggestions?.categories?.flatMap(c => c.genres) || topGenres;

    const [forYou, trending, newReleases] = await Promise.all([
      // Personalized: match top genres, exclude watched
      Movie.find({
        isPublished: true,
        genres: { $in: topGenres.length ? topGenres : recommendedGenres },
        _id: { $nin: watchedIds },
      }).sort({ rating: -1, views: -1 }).limit(20).select('title posterUrl backdropUrl genres rating releaseYear type duration slug'),

      // Trending: highest views this week
      Movie.find({ isPublished: true, _id: { $nin: watchedIds } })
        .sort({ views: -1, rating: -1 }).limit(20).select('title posterUrl genres rating releaseYear type duration slug'),

      // New releases
      Movie.find({ isPublished: true, _id: { $nin: watchedIds } })
        .sort({ createdAt: -1 }).limit(20).select('title posterUrl genres rating releaseYear type duration slug'),
    ]);

    return res.status(200).json({
      forYou,
      trending,
      newReleases,
      aiInsights: aiSuggestions,
      topGenres,
      hasHistory: history.length > 0,
    });
  } catch (err) {
    console.error('[recommendations]', err);
    return res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});
