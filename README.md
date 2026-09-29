# MetaBite

**Point your camera at a meal. Get the macros back in seconds.**

MetaBite is a React Native app that estimates the calories and macronutrients of a
meal from a photo, then prices that estimate against real nutrition databases
instead of trusting the vision model's invented numbers.

Scan → review → log. No barcode hunting, no food search, no portion guesswork.

---

## Why this is not just "ask an AI model"

A vision model is good at **what** is on the plate and bad at exact **gram
weights**. Nutrition databases are the reverse: authoritative per-100 g values,
but they need a name to look up and cannot see the portion. MetaBite splits the
problem along that seam and then checks its own work.

**1. Scale calibration, not portion guessing.** The prompt is built around
measurement rather than serving sizes. A coin, card or thumb placed *beside* the
food becomes the ruler, and the model is told explicitly that distance and
apparent size are irrelevant — only the ratio to the reference object matters.
Without a reference object visible, it is told to stay conservative.

**2. A side view is worth more than a better top-down shot.** From directly
above, a half-full bowl and a full bowl are the same picture. The two-photo mode
exists for exactly this, and the model is instructed to trust the side view when
it contradicts a generous read from above.

**3. Consensus, not first-source-wins.** The model proposes the food's identity;
the databases price it. Open Food Facts, USDA FoodData Central and Spoonacular
are queried in parallel, name-checked, clustered by whether they actually agree
on calories, and averaged with trust weights. Averaging is what damps the
run-to-run spread the model has on weights.

**4. Name disambiguation, because the obvious approach is quietly wrong.**
`src/lib/nameMatch.ts` exists because taking a database's first result produces
genuinely wrong food:

- USDA lists rice, pasta, oats and legumes **twice** — raw and cooked — under
  near-identical names. Cooked white rice is 130 kcal/28 g carbs per 100 g; dry
  is 365 kcal/80 g. Unweighted, whichever row the API returns first wins, and a
  plate of rice inflates roughly 3×. Dry staples now lose outright when the scan
  is of prepared food.
- `"milk"` used to match `"Milk tea, prepared"` at 1.0, so a cup of chai was
  priced as pure dairy. Identity nouns are now checked for commodity overlap, so
  a parent term (`"Fish, salmon, Atlantic"` for *salmon*) is accepted while an
  unrelated one is a hard reject.

**5. It audits its own output.** `src/lib/sanity.ts` checks the finished result
against physical limits for what was identified — weight ceilings by food class,
protein-density ceilings for drinks (a cup of tea is ~0 g protein per 100 ml),
an Atwater cross-check, and whole-meal ceilings that catch a *systematically*
wrong total no per-row check can see. Failures are surfaced, not silently shown
as fact.

**6. It degrades honestly.** The Gemini free tier allows only ~20 requests per
model per *day*, and the 429 says "retry in 25s" while the real limit resets at
midnight Pacific. Retrying is useless, so an exhausted model is treated as a
routing signal: the app walks a chain of models, since each has its own separate
quota bucket. Repeat scans of the same photo are served from a local cache so
they cost nothing.

---

## Features

- **One or two photo scan** with a framing guide and optional quick-specs override
  (`"half the plate"`, `"this is a diet coke"`)
- **Editable review screen** — every ingredient's weight and macros can be
  corrected, and the totals re-audit themselves as you type
- **On-demand database verification** per ingredient or across the whole list
- **Multi-source consensus** with per-ingredient agreement reporting
- **Physical sanity audit** that catches the classic failure modes
- **Animated fluid tank** dashboard, Reanimated on the UI thread
- **30-day history** with a hand-rolled bar chart and per-day macro breakdown
- **Micronutrients** (7 vitamins/minerals) with % daily value
- Offline-safe date maths, a real day boundary at **00:00 Asia/Karachi**, and
  single-user RLS on every table

---

## Tech stack

| | |
|---|---|
| Framework | Expo SDK 57, React Native 0.86, React 19, New Architecture |
| Language | TypeScript (`tsc --noEmit` clean) |
| Styling | NativeWind 5 RC + Tailwind 4, with the palette mirrored in `src/theme.ts` and `global.css` |
| Animation | Reanimated 4 (UI-thread driven) |
| Icons / charts | `react-native-svg` — hand-drawn glyphs, no chart library |
| Backend | Supabase (Postgres + RLS), email/password auth |
| Vision | Google Gemini (`responseSchema`-constrained, `temperature: 0`) |
| Nutrition data | USDA FoodData Central, Open Food Facts, Spoonacular |
| Images | `expo-image-manipulator` for on-device downscaling |

### Performance notes

The scan path is latency-critical, so a few decisions are load-bearing:

- The camera is asked for a **~1.3 MP capture** instead of its 12 MP default.
  The full-resolution encode costs hundreds of milliseconds of phone CPU before
  a single byte is sent, and the extra pixels are discarded anyway — the model
  reads the image at 768 px internally.
- Captures are **downscaled to 1280 px on the long side at capture time**, so the
  image in memory, the base64, the cache key and the upload payload are all the
  same small frame. Nothing is encoded twice.
- `expo-image-manipulator` **ignores EXIF orientation**, so `skipProcessing` is
  deliberately left off the camera and the resize axis is verified against the
  rendered result rather than trusted. Getting this wrong ships sideways photos.
- Sources that reject the key **latch themselves off** for the session instead of
  costing one doomed request per ingredient per scan.

---

## Getting started

```bash
git clone https://github.com/<your-username>/MetaBite.git
cd MetaBite
npm install
cp .env.example .env.local     # then fill in the values
```

### Environment

Only `EXPO_PUBLIC_*` variables reach the client, and they are **not secret** —
they ship inside the APK and can be read out of it. Your data is protected by row
level security, not by key obscurity. Scope every key to least privilege.

| Variable | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | Supabase publishable key |
| `EXPO_PUBLIC_GEMINI_API_KEY` | yes | Vision model ([free key](https://aistudio.google.com/apikey)) |
| `EXPO_PUBLIC_GEMINI_MODEL` | no | Defaults to `gemini-3.8-flash` |
| `EXPO_PUBLIC_USDA_API_KEY` | recommended | USDA FoodData Central |
| `EXPO_PUBLIC_SPOONACULAR_API_KEY` | optional | Only source of per-ingredient micronutrients |

Never put an `sb_secret_` key in `.env.local` — it bypasses RLS and must never
reach a client build.

### Database

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Migrations are in `supabase/migrations/`. The schema is strictly single-user:
rows are scoped by `user_id` and enforced by RLS. The app rolls over at
**00:00 Asia/Karachi**, not server UTC, and both `public.app_day()` and
`src/lib/dates.ts` must agree or meals logged late at night get misfiled.

### Run

```bash
npm start              # dev server
npm run android        # debug build
npm run typecheck      # tsc --noEmit
```

### Release APK

```bash
npm run prebuild       # regenerate the native project (not tracked in git)
npm run android:apk    # signed release build
```

Requires a JDK 21 and the Android SDK. Signing reads `android/keystore.properties`
(`storeFile`, `storePassword`, `keyAlias`, `keyPassword`) — **never commit it**.

---

## Project structure

```
src/
  screens/     Dashboard, History, Settings, Scan, IngredientEditor, MealDetail,
               Onboarding, Auth, BrandSplash
  components/  AnalyzingView, FluidTank, NutritionBreakdown, AvatarIcon, NutritionIcons
  context/     MetaBiteContext - the single source of app state
  lib/
    gemini.ts        vision call, model chain, quota handling
    consensus.ts     multi-source agreement and trust-weighted averaging
    nameMatch.ts     food-name disambiguation (dry vs cooked, commodity overlap)
    sanity.ts        physical plausibility audit
    analyze.ts       the scan pipeline, with real progress stages
    imagePrep.ts     on-device downscale and capture-size selection
    pictureSize.ts   pure capture-size ranking (testable without a device)
    dates.ts         app-timezone day maths, no Supabase or React imports
    history.ts       30-day loading and aggregation
tests/         sanity, nameMatch, quota, history
supabase/      migrations
```

The pure modules under `src/lib/` deliberately avoid importing React or Supabase,
so the logic that is easy to get subtly wrong — timezone maths, food-name
matching, plausibility limits — can be exercised in plain Node.

---

## Known limitations

- **No tap-to-focus.** `expo-camera` 57 exposes no `focus` prop and no `focus()`
  method, and the Android view hardcodes its metering point. Rather than draw a
  reticle that implies a focus lock which never happens, double-tap toggles the
  `zoom` prop, which *is* wired to CameraX. No zoom readout is drawn, because the
  module exposes no maximum zoom ratio and any number could overstate what the
  device applied.
- **Micronutrients are estimates**, derived from identified foods rather than
  measured. The databases improve them, but a photo cannot settle them.
- **The free Gemini tier is ~20 scans/day** across the model chain.
- **Photos are not stored.** `logged_meals.photo_path` exists but nothing writes
  it and no storage bucket is provisioned.
- **No test runner is configured.** `tests/` contains real specs that currently
  cannot be executed — see the scripts in `package.json`.
- The vision model cannot resolve mixed dishes reliably; adding a plate of
  biryani as separate items gives markedly better numbers.

---

## License

The `LICENSE` file is currently **Expo's** MIT license (© 650 Industries), left
over from the template. That is almost certainly not the intended attribution for
this project — replace it before publishing.

`EXPO_PUBLIC_*` values are public by design. Third-party nutrition data is used
under the terms of USDA FoodData Central, Open Food Facts (ODbL) and
Spoonacular.
