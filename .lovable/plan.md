# AI Credits + Repriced Plans

Mirror Lovable's credit model: every AI action costs credits, plans grant a monthly bucket, free users also get a small daily bucket, balance is shown in the header.

## Pricing (≈20% over Lovable)

| Tier | Monthly | Yearly (/mo) | Monthly credits | Daily credits | Notes |
|---|---|---|---|---|---|
| Free Beta | $0 | $0 | — | 6 (cap 35/mo) | 1 published app |
| Starter | $29 | $23 | 120 | — | was $25 / 100 cr on Lovable |
| Pro | $59 | $47 | 300 | — | was $50 / 250 cr |
| Scale | $119 | $95 | 700 | — | new tier, was $100 / 500 cr |
| Business | $299 | $239 | 2,000 | — | was $250 / 1,500 cr, adds SSO, team seats |

1 credit ≈ 1 AI Studio generation / chat turn. Image gen + heavy ops cost more (configurable multiplier, default 1).

## Database (single migration)

- `ai_credit_balances(user_id PK, monthly_remaining int, monthly_granted int, daily_remaining int, period_start timestamptz, last_daily_reset date, updated_at)` — RLS: owner select; service-role write.
- `ai_credit_ledger(id, user_id, project_id null, amount int, reason text, balance_after int, created_at)` — append-only audit; RLS owner select.
- Postgres function `consume_ai_credits(p_user uuid, p_amount int, p_reason text, p_project uuid)` returns `{ok, remaining}`:
  - Resets `daily_remaining` if `last_daily_reset < today`.
  - Resets `monthly_*` if `period_start + 30d <= now()` (or on plan change).
  - Deducts from daily first, then monthly. Inserts ledger row. Returns insufficient if both empty.
- Function `grant_ai_credits(p_user uuid)` reads `profiles.plan`, sets monthly bucket per plan map, resets `period_start`.
- Trigger on `profiles` plan change → call `grant_ai_credits`.
- Backfill: insert balances for all existing profiles with their plan's grant.

## Server functions

- `src/lib/credits.functions.ts`
  - `getCreditBalance()` — authed, returns balance + plan tier.
  - `consumeCredits({amount, reason, projectId?})` — authed wrapper around RPC, throws typed `INSUFFICIENT_CREDITS`.
- Wire into existing AI call sites:
  - `aiGenerate`, `aiResearch`, `aiCodeReview`, `aiDebug`, `aiPalette`, `aiOptimize` (1 cr each)
  - `pixlabGenerate` (3 cr), `pixlabBgRemove` / `pixlabFilter` (2 cr)
  - `generateProject` (10 cr)
  - `project-chat` send (1 cr)
  - Each handler calls `consumeCredits` first; on `INSUFFICIENT_CREDITS` returns `{ok:false, error:"Out of credits — upgrade to continue", code:"NO_CREDITS"}`.

## Frontend

- `src/hooks/useCredits.ts` — TanStack Query around `getCreditBalance`, invalidated after every AI mutation.
- `CreditBadge` component in the top nav (project page + dashboard) showing `⚡ {remaining} / {granted}` with a popover breakdown (monthly + daily) and "Upgrade" CTA when low.
- Update `AIStudioPanel`: show cost chip next to each tool button, surface `NO_CREDITS` toast with link to `/pricing`.
- Update `pricing.tsx`: replace the 3-tier array with the 5 tiers above; each card lists monthly credit allowance prominently; toggle keeps monthly/yearly.
- Add credit FAQ entries (what's a credit, do they roll over — no, daily reset rules).

## Payments

- Use `payments--batch_create_product` to create: `starter_plan`, `pro_plan`, `scale_plan`, `business_plan` each with `_monthly` and `_yearly` prices at amounts above. Quantity 1/1.
- Existing checkout flow already resolves `priceId` → Paddle price, no changes needed beyond adding new ids in `pricing.tsx` data.

## Out of scope (follow-ups)

- Credit top-up purchases (one-time packs) — note in FAQ as "coming soon".
- Per-org/workspace pooled credits.
- Admin override / gift credits UI (DB function exists, no UI yet).

## Order of execution

1. DB migration (table + functions + trigger + backfill).
2. Server functions + wire into AI handlers.
3. Frontend hook + badge + AIStudio cost chips.
4. Pricing page rewrite.
5. Paddle products via `batch_create_product`.
