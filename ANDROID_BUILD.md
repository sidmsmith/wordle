# Building the Wordle Android App

This guide walks you through building and sideloading the Wordle Android APK.  
The finished APK bundles all game assets locally — **no network needed to open or play**.  
When your device comes back online the app automatically syncs queued results to Neon.

---

## Prerequisites (one-time setup)

| Tool | Download |
|------|----------|
| **Node.js 18+** | https://nodejs.org |
| **Java JDK 17** | https://adoptium.net (Temurin 17 LTS) |
| **Android Studio** | https://developer.android.com/studio |

After installing Android Studio:
1. Open it once to complete the initial setup wizard (installs the Android SDK).
2. Make note of the **SDK path** shown at the end — usually  
   `C:\Users\<you>\AppData\Local\Android\Sdk`

---

## Build steps

### 1 – Clone / pull the latest code

```
git pull origin main
```

### 2 – Install Node packages

```
cd wordle
npm install
```

### 3 – Generate the Android project (first time only)

```
npx cap add android
```

> Skip this step if an `android/` folder already exists.

### 4 – Sync web assets into the Android project

Run this **every time** you change the game code:

```
npm run cap:sync
```

This runs `node scripts/prepare-capacitor-web.js` (writes `www/index.html`  
with the absolute sync URL) then calls `npx cap sync android`.

### 5 – Open in Android Studio

```
npm run cap:open
```

Or open Android Studio manually → **Open** → select the `wordle/android` folder.

### 6 – Build a debug APK

In Android Studio:

1. Wait for Gradle sync to finish (bottom status bar).
2. Menu: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
3. Click **locate** in the notification that appears, or find the file at:  
   `android/app/build/outputs/apk/debug/app-debug.apk`

### 7 – Install on your phone

**Option A – USB:**
```
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

**Option B – file transfer:**
1. Copy `app-debug.apk` to your phone (USB cable or Google Drive / email).
2. On the phone open the file — tap **Install** (allow "Install unknown apps" once).

---

## How it works offline

- All HTML, CSS, JS, and images are bundled **inside** the APK.  
  The app opens instantly with no network, even on a cold reboot.
- Completed games are stored in `localStorage` while offline.
- The moment the phone reconnects, the app POSTs queued games to  
  `https://wordle-theta-red.vercel.app/api/wordle-sync` and clears the queue.

---

## Future updates

Whenever you update `wordle.html` and push to GitHub:

```
git pull origin main
npm run cap:sync        # re-build www/ and sync to android/
```

Then rebuild the APK in Android Studio (step 6) and reinstall.
