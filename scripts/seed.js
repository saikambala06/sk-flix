'use strict';

/**
 * Populates an empty database so a fresh deployment isn't a blank screen, and
 * creates the first admin account.
 *
 *   node scripts/seed.js
 *
 * Reads MONGODB_URI, ADMIN_EMAIL and SEED_ADMIN_PASSWORD from the environment.
 * Safe to re-run: existing titles and accounts are left alone.
 */

require('dotenv').config?.({ path: '.env' });

const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('../api/lib/db');
const { Movie, User } = require('../api/lib/models');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';

// Public-domain films with freely hosted streams, so the catalogue works out
// of the box without pointing at anything you don't have the rights to.
const SAMPLE_TITLES = [
  {
    title: 'Big Buck Bunny',
    type: 'movie',
    releaseYear: 2008,
    rating: '7.8',
    genres: ['Animation', 'Comedy', 'Adventure'],
    description:
      'A gentle giant of a rabbit is pushed too far by three bullying rodents, and plans a calm, methodical response. Made by the Blender Foundation as an open movie project.',
    posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
    backdropUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Big_buck_bunny_poster_big.jpg',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    duration: 10,
    audioLanguages: ['English'],
    featured: true,
  },
  {
    title: 'Sintel',
    type: 'movie',
    releaseYear: 2010,
    rating: '7.5',
    genres: ['Fantasy', 'Adventure', 'Drama'],
    description:
      'A lone traveller searches across a harsh landscape for the dragon she raised from a hatchling. An open movie from the Blender Foundation.',
    posterUrl: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Sintel_poster.jpg',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    duration: 15,
    audioLanguages: ['English'],
  },
  {
    title: 'Elephants Dream',
    type: 'original',
    releaseYear: 2006,
    rating: '6.9',
    genres: ['Sci-Fi', 'Animation'],
    description:
      'Two men navigate a vast machine that reshapes itself around them, disagreeing about what any of it means. The first Blender open movie.',
    videoUrl:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
    duration: 11,
    audioLanguages: ['English'],
    featured: true,
  },
  {
    title: 'Tears of Steel',
    type: 'original',
    releaseYear: 2012,
    rating: '6.8',
    genres: ['Sci-Fi', 'Action'],
    description:
      'In a ruined Amsterdam, a group of scientists tries to undo a mistake made decades earlier. Shot to test open-source visual effects tooling.',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: 12,
    audioLanguages: ['English'],
  },
  {
    title: 'Sample Series',
    type: 'series',
    releaseYear: 2024,
    rating: '8.1',
    genres: ['Drama', 'Thriller'],
    description:
      'A placeholder series so you can see how seasons, episodes and the next-episode countdown behave. Replace it from the admin studio.',
    seasonCount: 1,
    episodeCount: 3,
    audioLanguages: ['English'],
    subtitleLanguages: ['English'],
    episodes: [
      {
        season: 1,
        episodeNumber: 1,
        title: 'First Light',
        description: 'The opening episode.',
        videoUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
        duration: 15,
      },
      {
        season: 1,
        episodeNumber: 2,
        title: 'The Turn',
        description: 'The middle episode.',
        videoUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
        duration: 15,
      },
      {
        season: 1,
        episodeNumber: 3,
        title: 'Last Word',
        description: 'The closing episode.',
        videoUrl:
          'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
        duration: 15,
      },
    ],
  },
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to .env and try again.');
    process.exit(1);
  }

  console.log('Connecting…');
  await connectDB();
  console.log('Connected.\n');

  let added = 0;
  let skipped = 0;
  for (const title of SAMPLE_TITLES) {
    const exists = await Movie.findOne({ title: title.title }).lean();
    if (exists) {
      skipped++;
      continue;
    }
    await Movie.create(title);
    added++;
    console.log(`  added  ${title.title}`);
  }
  console.log(`\n${added} title(s) added, ${skipped} already present.`);

  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const existing = await User.findOne({ email: ADMIN_EMAIL }).lean();
    if (existing) {
      console.log(`\nAdmin account already exists for ${ADMIN_EMAIL}.`);
    } else if (ADMIN_PASSWORD.length < 8) {
      console.log('\nSEED_ADMIN_PASSWORD is shorter than 8 characters — skipping admin creation.');
    } else {
      await User.create({
        name: 'Administrator',
        email: ADMIN_EMAIL,
        password: await bcrypt.hash(ADMIN_PASSWORD, 10),
        role: 'admin',
      });
      console.log(`\nAdmin account created for ${ADMIN_EMAIL}. Change the password after signing in.`);
    }
  } else {
    console.log('\nSet ADMIN_EMAIL and SEED_ADMIN_PASSWORD to create an admin account here.');
    console.log('Otherwise, sign up in the app with the ADMIN_EMAIL address to get admin rights.');
  }

  console.log('\nEnsuring indexes…');
  await Promise.all([Movie.syncIndexes(), User.syncIndexes()]);
  console.log('Done.');

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});
