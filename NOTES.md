# NOTES

## Money contract
- **Kobo travels as a decimal integer string** (`"21063026"`), rates as percent strings (`"18.25"`). A JSON number for money is a 400 on that field. Kobo values would fit in a double, but strings stop a float creeping in anywhere (JSON parsing, `parseFloat` in a form, another client) and map 1:1 to `BigInt`. Kobo is `bigint` in code and `INTEGER` in SQLite (read back as BigInt); the UI parses ₦ input with string maths.
- **Arithmetic is exact rationals over BigInt.** Half-up rounding happens only at: instalment (once), each period's interest, discount fee, penalty, advance.
- **Browser and server each have their own copy** of the money code: `backend/src/money` (authoritative: everything that posts) and `frontend/src/money` (previews, validation, formatting only; no waterfall or posting rules). `parity/parity.test.ts` runs the browser copy against the **live backend API** on 255 generated loans (₦1k–₦5bn, 0.5–60% to 4 dp, 1–60 months, plus range boundaries) and 201 invoices, decoding the API's JSON with the browser's own decoders: identical to the kobo. The backend copy is also tested for invariants over 500 cases (principal sums to P, closes at 0, only the last payment differs, no negatives). Worked Example 1 and the invoice table are pinned on both sides.

## Design
Append-only SQLite ledger (triggers block UPDATE/DELETE; fixes are reversing entries). The ledger service drops zero lines and refuses < 2 lines or Dr ≠ Cr. Repayment and settlement previews are computed by the server with the same functions that post, so the officer sees the exact entry that will post. The schedule is fixed at disbursement; paid/waived amounts live in an allocation subledger, so the tie-out compares two independent sources. Posting routes need an `Idempotency-Key`: check + work + stored response run in one transaction (replay → same response; same key, different body → 422; failures don't burn the key). The UI also locks the button and reuses one key per intent, and refetches from the server after every post.

## Assumptions
1. **Advance** = round_half_up(face × 80%) (no rounding point given).
2. **Penalty** is rounded once over all overdue days, not per day.
3. **Due dates** = start + k months, clamped to month end, anchored to the start date.
4. **Term-loan penalty/fee** has no rule, so the slots are always 0; the waterfall still runs in full order (tests inject values).
5. **Due** means due date ≤ payment date; paying before anything is due goes wholly to Unapplied Credit.
6. **Early payoff** is its own action: everything owed on due instalments + all remaining principal; future interest waived; loan closes. Normal over-payments never prepay.
7. Unapplied credit is not auto-applied later.
8. The debtor pays full face value; client payout and shortfall collection entries aren't modelled.
9. Settling on the due date = 0 days overdue. Closed loans refuse payments.
10. Input limits: principal ₦1–₦50bn, rate 0–100% (≤ 4 dp), term 1–360 months.

## Verified by hand (Playwright against `npm run dev`)
Example 1 matches row for row; double-click Approve → one entry; partial then over-payment → credit ₦59,369.74, tie-out green; server date error shown on its field; early payoff closes at ₦0.00; invoice at +96 days → payable ₦0.00, "client owes ₦942.47", journal as in the brief; trial balance level; no horizontal scroll at 375px.

## Not done
Reversal UI (ledger function + tests only), auth, accruals, payout/shortfall-collection entries, browser e2e in `npm test`.
