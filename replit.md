# AI Product Fit Scoring Engine

## Overview

A full-stack web application that analyzes product URLs and generates personalized Fit Scores based on user profile, interests, and purchase signals.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui (artifacts/fit-score)
- **Backend**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Auth**: Custom token-based auth with hashed passwords + sessions table

## Architecture

### Frontend (artifacts/fit-score)
- `src/pages/Login.tsx` — Login page
- `src/pages/Signup.tsx` — Signup page
- `src/pages/Onboarding.tsx` — Multi-step onboarding (5 steps)
- `src/pages/Dashboard.tsx` — Main product analysis + history
- `src/hooks/useAuth.ts` — Auth context and JWT management
- `src/components/FitScoreCard.tsx` — Animated Fit Score result display

### Backend (artifacts/api-server)
- `src/routes/auth.ts` — Signup, login, logout, /me
- `src/routes/profile.ts` — Get/upsert user profile + onboarding flag
- `src/routes/score.ts` — Product analysis + boost score
- `src/routes/history.ts` — History list + aggregate stats
- `src/lib/auth.ts` — Auth helpers (hash, token, session)
- `src/lib/fitEngine.ts` — Product intelligence + Fit Score computation

### Database Schema (lib/db/src/schema/)
- `users` — email, hashed password, onboardingCompleted flag
- `sessions` — JWT-like session tokens with expiry
- `profiles` — per-user profile (interests, apparel, AR measurements, email integration)
- `analyses` — history of product analyses with full result JSON

## Fit Score Engine

The engine in `fitEngine.ts`:
1. Detects product category from URL keywords (phones, laptops, footwear, apparel, audio, cameras, wearables, skincare)
2. Generates mock product intelligence (strengths, weaknesses, feature scores, risk factors)
3. Computes personalized score by matching user interests vs product keywords, feature quality, email purchase history, and risk factors
4. Supports 1-tap feature boost to recalculate with higher weighting on specific features

## Key Commands

- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/fit-score run dev` — run frontend locally
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm run typecheck` — full typecheck across all packages
