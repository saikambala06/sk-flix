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

The admin routes moved from `/api/movies` to `/api/admin/movies`. Anything calling the old paths needs updating; the frontend already is.

---

## Known limits

- **Rate limiting is per instance.** Each warm serverless function keeps its own counter, so a burst spread across many instances gets a higher effective ceiling. It stops single-client credential stuffing, which is the realistic threat. For a hard global limit, back it with Upstash Redis or use Vercel's WAF.
- **No video hosting.** The player takes URLs you supply. Use Mux, Cloudflare Stream or Bunny for real traffic — serving MP4s from object storage gets expensive and doesn't adapt to bandwidth.
- **`ratingCount` is recomputed on write.** Fine into the thousands; past that, move it to a scheduled job.
- **Sessions are localStorage tokens**, readable by any script on the page. `httpOnly` cookies would be stronger but need CSRF protection and a same-site deployment.
- **One HTML file.** It works and it's fast, but past ~6,000 lines you'll want a build step.

Only publish content you have the rights to distribute.
