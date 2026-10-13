# SkFlip — Android & Google TV apps

Native Kotlin/Jetpack Compose apps that talk directly to your existing SkFlip
backend (`/api/...` on Vercel) — no WebView. Three Gradle modules:

```
SkFlip-Android/
├── core/     → shared networking, models, auth/session (Android library)
├── mobile/   → phone & tablet app (Compose, Material3, bottom nav)
└── tv/       → Google TV / Android TV app (Compose, D-pad navigation)
```

## 1. Point it at your backend (1 line)

Open:

```
core/src/main/java/com/skflip/core/util/Constants.kt
```

and set:

```kotlin
const val BASE_URL = "https://YOUR-VERCEL-APP.vercel.app/"
```

Both apps read from this one place — that's the only required change before building.

## 2. Get an installable APK

You have two options — pick whichever's easier for you.

### Option A: GitHub Actions (no local install needed)

This repo includes `.github/workflows/build-apks.yml`, which builds both
APKs in the cloud and attaches them to the workflow run.

1. Push this folder to a new GitHub repo (private is fine):
   ```bash
   cd SkFlip-Android
   git init && git add . && git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
2. On GitHub, open the **Actions** tab → you should see "Build SkFlip APKs"
   running automatically (it triggers on push). If it doesn't, click it and
   hit **Run workflow**.
3. When it finishes (a few minutes), open the completed run and scroll to
   **Artifacts** at the bottom — you'll see `skflip-mobile-debug-apk` and
   `skflip-tv-debug-apk`. Download and unzip each to get the `.apk` file.
4. Install on a device:
   - **Phone**: copy the mobile APK to your phone and open it (you'll need
     to allow "install unknown apps" once), or run
     `adb install app-debug.apk` with the phone connected over USB.
   - **Google TV**: easiest via `adb connect <tv-ip-address>:5555` (with
     Developer options → Network debugging turned on on the TV), then
     `adb install app-debug.apk`.

These are **debug-signed** builds — perfect for installing and testing on
your own devices, but not what you'd upload to the Play Console. For a
release build you'd add a signing config and run `assembleRelease` /
`bundleRelease` instead (see the Play Store section below).

### Option B: Android Studio, locally

- **File → Open** → select the `SkFlip-Android` folder.
- If Android Studio reports the Gradle wrapper is missing, let it regenerate
  one automatically (it will offer to do this on open), or run
  `gradle wrapper --gradle-version 8.7` yourself if you have Gradle installed.
- Let Gradle sync. First sync downloads Compose/Media3/Retrofit etc., so it
  needs internet access once.
- Choose the **mobile** run configuration for a phone/tablet device or emulator,
  or **tv** for an Android TV / Google TV device or emulator.

## 3. What's implemented

Both apps cover the full surface of your backend (`index.js`):

| Feature | Mobile | TV |
|---|---|---|
| Browse catalog (Originals / Series / Movies / Genre rows) | ✅ | ✅ |
| Title detail page, episodes by season | ✅ | ✅ |
| Playback (HLS `.m3u8` or direct file `videoUrl`) via Media3/ExoPlayer | ✅ | ✅ |
| Auto "Next Episode" | ✅ | ✅ |
| Sign up / Log in (JWT, persisted via DataStore) | ✅ | ✅ (optional — browsing works as a guest) |
| Wishlist (add/remove, synced via `/api/wishlist`) | ✅ | ✅ |
| Search | ✅ | — (TV apps generally route search through the device's global search; add later if you want an in-app search row) |
| D-pad-first focus states (scale + gold border) on every card/button | — | ✅ |

Browsing the catalog never requires login, matching your backend (`GET /api/movies`
is public) — both apps let people watch as a guest and only ask for an account
when they tap the wishlist heart.

## 4. Before you publish

- **App icon**: both modules ship a placeholder gold "S" adaptive icon
  (`mobile/.../res/drawable/ic_launcher_foreground.xml` and the same path under
  `tv/`). Swap in real artwork.
- **TV banner**: `tv/src/main/res/drawable/banner.xml` is a plain dark
  rectangle placeholder. Android TV's launcher requires a 320×180dp banner —
  replace this with a real branded PNG/JPG banner before shipping.
- **App IDs**: currently `com.skflip.mobile` and `com.skflip.tv`
  (`applicationId` in each module's `build.gradle.kts`). Change to your own
  reverse-domain ID before release.
- **Signing**: neither module has a release signing config yet — add a
  keystore and `signingConfigs` block in `mobile/build.gradle.kts` /
  `tv/build.gradle.kts` when you're ready to build a release AAB for the
  Play Console.
- **Google TV listing**: Google Play requires a separate TV-specific listing
  even though it can ship from the same Play Console app — see
  [Android TV app quality guidelines](https://developer.android.com/docs/quality-guidelines/tv-app-quality)
  before submitting.

## 5. Notes on the API contract

The apps assume your backend's exact shapes from `index.js`:

- `POST /api/auth/signup` / `POST /api/auth/login` → `{ token, user }`
- `GET /api/movies` → `{ movies: [...] }`, `GET /api/movies/:id` → a single movie
- `GET /api/wishlist` → `{ movieIds, offerClaimed }`
- `POST /api/wishlist/toggle/:movieId` → `{ movieIds, added }`
- `PUT /api/wishlist` → `{ movieIds, offerClaimed }`
- All wishlist routes require `Authorization: Bearer <token>` — handled
  automatically by `core`'s `AuthInterceptor`.

If you change the backend's response shapes later, update the matching
`data class` in `core/src/main/java/com/skflip/core/model/` — everything
else (UI, ViewModels) reads through those models so it'll keep working.
