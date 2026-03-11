# AI Macro Coach

A modern personal macro-tracking web app built with Next.js and Tailwind CSS.
Users set a personal profile and goal, get personalized daily calorie/macro targets, then log meals in natural language using OpenAI.

## What it does

- Profile setup: age, gender, height, weight, waist, activity level, and open goal text.
- Personalized daily targets: calories, protein, carbs, fat.
- Profile & Goals modal to configure body stats and instantly calculate macro targets.
- Goal-aware targeting for fat loss, muscle gain, maintenance, or recomposition.
- Natural-language meal parsing through OpenAI server route.
- Photo capture/upload flow with image preview and server-side AI image analysis route.
- Structured JSON results table with calories + macros per food item.
- Top dashboard progress bars showing consumed vs target + percentage.
- Error handling and loading state.

## Tech stack

- Next.js 14 (App Router)
- React + TypeScript
- Tailwind CSS
- OpenAI Node SDK
- Vercel-ready structure

## Setup

1. Install dependencies

```bash
npm install
```

2. Create `.env.local`

```env
OPENAI_API_KEY=your_openai_key
```

3. Run

```bash
npm run dev
```

## Architecture

- `app/page.tsx`: dashboard composition and state.
- `components/ProfileForm.tsx`: personal profile input UI.
- `components/ProgressBars.tsx`: progress widgets for calories/protein/carbs/fat.
- `components/ResultsTable.tsx`: food-level nutrition table and macro totals.
- `app/api/calories/route.ts`: server-side OpenAI call and JSON validation for text input.
- `app/api/analyze-image/route.ts`: server-side OpenAI image analysis for camera/upload photos.
- `lib/nutrition.ts`: personalized target calculation engine (BMR/TDEE + goal heuristic).
- `lib/types.ts`: shared app domain types.

## Target calculation model

The app estimates targets using:

- Mifflin-St Jeor BMR formula.
- Activity multiplier to estimate TDEE.
- Waist-to-height heuristic to estimate body-fat context.
- Goal text classifier (keyword-based) to infer strategy:
  - fat loss
  - muscle gain
  - maintenance
  - recomposition
- Macro allocation prioritizing protein based on strategy.

> Note: Estimates are educational and not medical advice.

## Future-ready design

The structure supports easy expansion to:

- meal history persistence
- weekly statistics
- progress charts
- image-based meal recognition

## Deploy to Vercel

- Import repo into Vercel.
- Set `OPENAI_API_KEY` in Project Environment Variables.
- Deploy.


## Vercel deployment note

This app now initializes the OpenAI client at **request time** inside the API handler.
That means builds won't fail if `OPENAI_API_KEY` is missing during compile, but runtime API calls will return a clear error until you configure the variable in Vercel.
