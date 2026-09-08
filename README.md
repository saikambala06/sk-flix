# SkFlip

A streaming platform: HLS video player, admin studio for managing a catalogue, accounts with cross-device resume, watchlists and ratings. Express + MongoDB on Vercel serverless, with a zero-build frontend.

---

## Read this first

The previous version shipped **every admin endpoint without authentication**. `requireAuth` existed in the code but was never applied to a single admin route, so the admin login screen only hid the UI. Anyone with the URL could list all users and their email addresses, promote themselves to admin, or delete the whole catalogue:

```bash
curl https://your-site.vercel.app/api/admin/users
curl -X DELETE https://your-site.vercel.app/api/admin/users/<id>
```

That is fixed. Both `requireAuth` and `requireAdmin` now run above every admin route.

**Two things to do when you deploy:**

1. **Set a new `JWT_SECRET`.** The old code fell back to a hardcoded key when the environment variable was missing, so any token issued under that fallback can be forged. A new secret invalidates them all.
   ```bash
   openssl rand -base64 48
   ```
2. **Check your database.** If the open API was live for any length of time, look for accounts you don't recognise and for anyone with `role: "admin"` who shouldn't have it.

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Fill in `.env`

| Variable | Required | Notes |
|---|---|---|
| `MONGODB_URI` | Yes | Atlas → Connect → Drivers. Keep `/skflip` before the `?`. |
| `JWT_SECRET` | Yes | `openssl rand -base64 48`. The server refuses to start in production without it. |
| `ADMIN_EMAIL` | Recommended | This address gets admin rights on signup. Without it, the first account ever created becomes admin. |
| `EMAIL_USER` / `EMAIL_PASS` | Optional | Gmail address plus an [App Password](https://myaccount.google.com/apppasswords). Only password reset needs this. |
| `ALLOWED_ORIGINS` | Optional | Only if the frontend moves to a different domain than the API. |

### 3. Seed and run

```bash
npm run seed    # sample titles, indexes, optional admin account
npm run dev     # http://localhost:3000
```

The frontend is served by the same process locally, so there is no separate dev server and no build step.

### 4. Deploy

Push to GitHub and import the repo in Vercel, or:

```bash
npx vercel --prod
```

Add every variable from `.env` under **Settings → Environment Variables** before the first deploy.

---

## Tests

```bash
node scripts/smoke-test.js   # 23 checks: auth gates, headers, validation, throttling
node scripts/e2e-test.js     # 19 checks: signup, sign-in, role separation, lockout guards
```

Both stub the database, so they run anywhere with no MongoDB and no network.

---

## What changed

### Security

| | Before | After |
|---|---|---|
| Admin API | Open to anyone | `requireAuth` + `requireAdmin` on the router |
| `JWT_SECRET` | Hardcoded fallback | Required; refuses to boot in production without it |
| Auth endpoints | No throttling | Rate limited per IP |
| Reset codes | Plaintext in the database | SHA-256 hashed, attempt-capped, constant-time compare |
| Login errors | Distinguished unknown email from wrong password | Identical response either way |
| Query input | Raw into Mongo | `$`-operators stripped, so `{"email":{"$gt":""}}` can't sign in |
| Content writes | `Movie.create(req.body)` | Field whitelist; `javascript:` and `data:` URLs rejected |
| Password change | Old sessions stayed valid | Bumps `tokenVersion`, signing out other devices |
| Email casing | `A@b.com` and `a@b.com` were separate accounts | Normalised on write |
| Errors | Stack traces returned to the client | Generic message out, detail to the server log |

Admins also can't demote or delete themselves, and the last remaining admin can't be removed.

### Frontend

- **API base was hardcoded** to `sk-flix-five.vercel.app`, so the app broke on any other domain. Now same-origin.
- **Splash screen could hang forever** — one failed request in `init()` left the spinner up with no recovery. Now hides in a `finally`.
- Output escaping on every card renderer, the details panel and the admin table. Titles and review text were going into `innerHTML` raw.
- SEO and social tags: the page had no description and no Open Graph data.
- PWA manifest, icons and service worker. The install popup existed in code but could never fire without a manifest.
- Offline page, and cached browsing of titles already opened.
- Keyboard focus rings — the CSS reset removed outlines and never replaced them.
- `prefers-reduced-motion` respected.
- Skip-to-content link.
- `hls.js` pinned to 1.5.13 instead of `@latest`.

### New

- **Ratings and reviews** — five-star input, average on each title, one review per person per title.
- **`/api/home`** — one request for the whole landing page instead of three.
- **Search** backed by a weighted text index, plus genre/year filters, sorting and pagination.
- **View counts**, feeding a "most watched" list on the dashboard.
- **Dashboard warnings** for titles with no video link and titles left unpublished.
- **Related titles** endpoint.
- Profile updates and password change.

---

## API

Public:

```
GET    /api/health
GET    /api/home                      All home rows in one response
GET    /api/movies                    ?type= &genre= &search= &year= &sort= &page= &limit=
GET    /api/movies/:id
GET    /api/movies/:id/related
GET    /api/movies/:id/reviews
GET    /api/genres                    With counts
POST   /api/movies/:id/view
POST   /api/auth/signup
POST   /api/auth/login
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

Signed in:

```
GET    /api/auth/me
PUT    /api/auth/profile
PUT    /api/auth/password
GET    /api/wishlist
GET    /api/wishlist/full             Hydrated with title data
POST   /api/wishlist/toggle/:movieId
PUT    /api/wishlist
POST   /api/wishlist/claim
GET    /api/continue-watching
POST   /api/continue-watching
DELETE /api/continue-watching/:movieId
DELETE /api/continue-watching
POST   /api/movies/:id/reviews
DELETE /api/movies/:id/reviews
```

Admin only:

```
GET    /api/admin/stats
GET    /api/admin/movies
POST   /api/admin/movies
PUT    /api/admin/movies/:id
PATCH  /api/admin/movies/:id/publish
DELETE /api/admin/movies/:id
GET    /api/admin/users
PUT    /api/admin/users/:id
DELETE /api/admin/users/:id
```

`sort` accepts `newest`, `oldest`, `popular`, `rated`, `az`, `year`.

---

## Layout

```
api/
  index.js              Entry: headers, CORS, routing, error handling
  lib/
    db.js               Serverless-safe connection caching
    models.js           Schemas and indexes
    auth.js             Token signing, requireAuth, requireAdmin
    mailer.js           Password reset email
    rateLimit.js        Sliding-window limiter
    validate.js         Input sanitising, field whitelists, URL safety
  routes/
    auth.js  content.js  user.js  admin.js
public/
  index.html            The whole client
  sw.js  manifest.json  offline.html  icons
scripts/
  seed.js  smoke-test.js  e2e-test.js
```

The admin content routes moved from `/api/movies` to `/api/admin/movies`. Any external client calling the old paths needs updating. `scripts/test-api-contract.js` cross-checks every call the frontend makes against the routes the server actually mounts, so a mismatch fails the suite instead of surfacing when someone presses Save.

---

## Known limits

- **Rate limiting is per instance.** Each warm serverless function keeps its own counter, so a burst spread across many instances gets a higher effective ceiling. It stops single-client credential stuffing, which is the realistic threat. For a hard global limit, back it with Upstash Redis or use Vercel's WAF.
- **No video hosting.** The player takes URLs you supply. Use Mux, Cloudflare Stream or Bunny for real traffic — serving MP4s from object storage gets expensive and doesn't adapt to bandwidth.
- **`ratingCount` is recomputed on write.** Fine into the thousands; past that, move it to a scheduled job.
- **Sessions are localStorage tokens**, readable by any script on the page. `httpOnly` cookies would be stronger but need CSRF protection and a same-site deployment.
- **One HTML file.** It works and it's fast, but past ~6,000 lines you'll want a build step.

Only publish content you have the rights to distribute.

---

## Video sources

### What browsers can actually play

| | Support |
|---|---|
| Containers | MP4, WebM, Ogg — plus HLS and DASH via Media Source Extensions |
| Video codecs | H.264 everywhere; VP9 and AV1 widely; HEVC only on Safari |
| Audio codecs | AAC everywhere; Opus and Vorbis in WebM |

**MKV, AVI, WMV, FLV and raw MPEG-TS do not play in any browser**, even when the streams inside are H.264 and AAC. The container is the problem, not the codecs. An MKV is usually an instant fix:

```bash
ffmpeg -i input.mkv -c copy -movflags +faststart output.mp4
```

That's a remux, not a re-encode — seconds, not minutes, and no quality loss.

### How the player routes a URL

`resolveSource(url)` inspects each URL and picks an engine:

- **`.m3u8` or `/hls/` in the path** → hls.js, or Safari's native HLS where that's better
- **`.mpd`** → dash.js, lazy-loaded only when a DASH manifest actually appears, so nobody downloads 400 KB they don't need
- **`.mp4`, `.webm`, `.ogv`, `.mov`** → the native `<video>` element
- **`.mkv`, `.avi`, `.wmv`, `.flv`, `.ts`** → refused up front with the ffmpeg command to fix it
- **YouTube, Vimeo, Mega, MediaFire, `.php` pages** → refused; these serve HTML, not a stream
- **No extension** (signed or tokenised URLs) → falls back to path keywords, then progressive

Detection strips the query string first, so `movie.mp4?token=abc` reads as `.mp4`, and a path like `/m3u8-archive/movie.mp4` is no longer mistaken for HLS.

Share links are rewritten on save: Google Drive `/file/d/<id>/view` becomes the direct download endpoint, Dropbox `?dl=0` becomes `?raw=1`, GitHub `/blob/` becomes `/raw/`.

### The admin URL checker

Paste a URL into the upload form and it is checked before you save. It reports format, reachability, whether range requests work, and file size — using a ranged GET rather than HEAD, since some CDNs reject HEAD outright.

### Large files

"Any size" comes down to **HTTP range requests**. Without `Accept-Ranges: bytes` the browser cannot seek and must download the entire file before playback starts. The checker warns when a host lacks it.

Above roughly 2 GB, a single progressive MP4 streams badly regardless of range support: one fixed bitrate, no adaptation, long startup. Use HLS instead — it splits the file into segments and switches quality to match the viewer's bandwidth. R2 stores the segments and egress is free.

### CORS

This trips people up because the two paths differ:

- **Progressive MP4** — `<video src>` does **not** require CORS. A plain MP4 from a host with no CORS headers plays fine.
- **HLS and DASH** — fetched by JavaScript, so they **do** require `Access-Control-Allow-Origin`. Without it the stream fails with what looks like a generic network error.

The player names CORS explicitly in that case instead of showing "Video stream error".

### Error handling

Fatal HLS errors now retry a bounded number of times — 3 network, 2 media — then stop with a specific message. The previous version called `startLoad()` on every fatal error with no cap, so a dead URL retried forever and pinned the CPU.

### Source fallback

A title can carry both an `hlsUrl` and a `videoUrl`. The player tries the adaptive stream first, because it seeks better and adapts to bandwidth, and falls back to the direct file when that fails. A dead HLS link no longer kills playback.

```
hlsUrl  →  fails  →  videoUrl  →  fails  →  specific error
```

Three details keep it from thrashing:

**Generation counter.** Tearing down hls.js can fire its error handler *after* the next source is attached. Every async callback checks a token, so a superseded attempt cannot advance the queue twice and skip a source.

**Position is preserved.** If the stream dies twenty minutes in, the fallback resumes at twenty minutes rather than restarting. Positions under one second are ignored, since those mean playback never really began.

**Unplayable formats are skipped, not attempted.** An MKV sitting in `videoUrl` costs no time.

Failures are ranked by how useful they are. If any source failed for a reason you can act on — an MKV that needs remuxing — that message wins over a generic summary, even when several sources failed. The full list goes to the console.

The switch shows a brief info toast rather than an error, since playback is continuing.

```bash
node scripts/test-fallback-chain.js   # 20 checks
node scripts/test-source-resolver.js  # 32 checks
```

---

## R2 storage

### There was no Cloudinary code to remove

Nothing in the project ever referenced Cloudinary — you were pasting Cloudinary URLs into the `videoUrl` field by hand. Those URLs keep working; the resolver treats them as ordinary progressive files. Replace them at your own pace.

### Why uploads go straight to R2

**Vercel caps a serverless request body at 4.5 MB.** A 2 GB film cannot be proxied through the API no matter how the endpoint is written. So the browser uploads directly to R2 using a presigned URL, and the server only ever handles the signature — never the bytes. This is faster too: one hop instead of two.

### Setup

1. Cloudflare dashboard → **R2** → create a bucket (e.g. `skflip-media`).
2. **Manage API Tokens** → create a token with **Object Read & Write** scoped to that bucket. Copy the access key id and secret — the secret is shown once.
3. Give the bucket a public address: either connect a custom domain (recommended) or enable the `r2.dev` subdomain.
4. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and `R2_PUBLIC_URL` to your environment.
5. **Add a CORS policy on the bucket** — without it the browser cannot PUT:

```json
[
  {
    "AllowedOrigins": ["https://your-site.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`ExposeHeaders: ["ETag"]` is not optional. Multipart completion needs each part's ETag, and the browser cannot read it unless the bucket exposes it. Miss this and large uploads fail at the final step with a confusing error.

### Using it

The upload form now has a drop zone above the video URL field. Choose or drop a file and it uploads to R2, then fills in the URL automatically.

- Under 48 MB: a single request.
- Over 48 MB: split into 16 MB parts, three at a time, with progress and per-part retry. A failed part retries three times with backoff rather than restarting the whole file.
- Cancelling aborts the multipart upload, so orphaned parts are not left billing as storage.
- Ceiling is 20 GB per object.

### Endpoints

```
GET    /api/admin/storage/status
POST   /api/admin/storage/upload-url          Single PUT
POST   /api/admin/storage/multipart/create
POST   /api/admin/storage/multipart/sign      Batches of up to 100 parts
POST   /api/admin/storage/multipart/complete
POST   /api/admin/storage/multipart/abort
GET    /api/admin/storage/objects
DELETE /api/admin/storage/object
POST   /api/admin/storage/playback-url        Refresh a signed URL
```

All admin-only. A leaked presigned PUT would let anyone write into your bucket, so the whole router sits behind `requireAuth` + `requireAdmin`, and both test suites check it.

### Private playback

Set `R2_PRIVATE_PLAYBACK=true` to keep the bucket private and sign every playback URL with a 6-hour expiry.

The trade-off is real: signed URLs carry a unique query string per request, so the CDN cannot cache them. You get hotlink protection and lose edge caching. For most catalogues a public bucket on a custom domain is the better default — leave this off unless you specifically need it.

### Keys

Uploads are stored as `video/<year>/<slug>-<random>.<ext>`, so `My Film (2024).mp4` becomes `video/2026/my-film-2024-a1b2c3d4.mp4`. The random suffix means re-uploading the same filename never overwrites the old object, which is why every upload can be cached immutably for a year.

Path traversal, control characters and unknown extensions are rejected before a key reaches the bucket.

```bash
node scripts/test-r2.js   # 35 checks
```


---

## Contract test

`scripts/test-api-contract.js` extracts every API call in `index.html`, extracts every route the Express app mounts, and checks each call resolves.

It exists because three admin calls kept pointing at `/api/movies` after those routes moved to `/api/admin/movies`. Everything compiled. Every other test passed. The failure only appeared when an admin pressed Save and got `No API route matches POST /movies`.

Unit tests could not catch it: the frontend and backend were each correct in isolation and only disagreed at the boundary. Run this after any route change.

```bash
npm test   # contract, security, e2e, resolver, fallback, R2 — 167 checks
```
