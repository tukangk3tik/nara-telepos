# POS Cart and Expenses List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cart removal compact and give Expenses a searchable, paginated full-width table with a create dialog.

**Architecture:** Reuse the existing cart callback, expense API, Table, Dialog, and Input components. Filter and paginate the expense array in `Expenses.svelte`; keep all mutations on their existing endpoints.

**Tech Stack:** Svelte 5, TypeScript, Tailwind, shadcn-svelte, Lucide, Bun tests.

**Spec:** `docs/superpowers/specs/2026-09-27-pos-cart-expenses-list-design.md`

## Global Constraints

- No dependency or server endpoint changes.
- Search expense number, category, date, and notes without case sensitivity.
- Show 10 filtered expense rows per page and reset to page 1 when search changes.
- Keep deleted rows, details, admin Delete, and accessible button labels.

## Review Focus

- Empty expense list: show a clear no-data message and safe pagination controls.
- No search matches: show the empty message without stale rows.
- Search after visiting a later page: return to page 1.
- Successful creation: close dialog, refresh list, and permit another creation.
- Failed creation: keep dialog open with the error visible.

### Task 1: Compact Cart removal

**Files:** Modify `src/client/components/Cart.svelte`; test `tests/client-ui.test.ts`.

**Interfaces:** Keep `onRemove(id: number): void` and the existing `aria-label`.

- [x] Change the Cart UI test to expect a Lucide trash icon and icon-sized Remove button; run `rtk bun test tests/client-ui.test.ts` and observe failure.
- [x] Import `Trash2` from `@lucide/svelte/icons/trash-2` and render `<Trash2 />` inside the existing button with `size="icon-sm"` and its current `aria-label`.
- [x] Run `rtk bun test tests/client-ui.test.ts` and confirm the Cart test passes.

### Task 2: Search and paginate Expenses

**Files:** Modify `src/client/routes/Expenses.svelte`; test `tests/client-ui.test.ts`.

**Interfaces:** Consume the existing `Expense[]` from `GET /api/expenses`; no API changes.

- [x] Add a failing UI test for a full-width history card, search input, 10-row page size, empty result, and Previous/Next controls. Run `rtk bun test tests/client-ui.test.ts` to confirm failure.
- [x] Add `query`, `page`, and reactive filtered/paged arrays. Search `expenseNumber`, `categoryName`, `transactionDate`, and `notes` with `toLowerCase().includes(...)`; reset `page` in the search input handler. Slice 10 rows per page.
- [x] Place the search input above the table, iterate paged rows, render `No data available` for no matches, and add Previous/Next buttons with disabled states and a page indicator.
- [x] Run `rtk bun test tests/client-ui.test.ts` and confirm the new test passes.

### Task 3: Move expense creation into a dialog

**Files:** Modify `src/client/routes/Expenses.svelte`; test `tests/client-ui.test.ts`.

**Interfaces:** Preserve `POST /api/expenses` and the existing `create(event: SubmitEvent)` payload.

- [x] Add a failing UI test for the New expense button, dialog title, and form inside the dialog. Run `rtk bun test tests/client-ui.test.ts` to confirm failure.
- [x] Move the existing form into `Dialog.Root`, open it from the table header button, close it after successful creation, and show create errors in the dialog. Keep detail and deletion UI working.
- [x] Run `rtk bun test tests/client-ui.test.ts` and confirm the new test passes.

### Task 4: Verify the combined change

**Files:** Check `src/client/components/Cart.svelte`, `src/client/routes/Expenses.svelte`, and `tests/client-ui.test.ts`.

- [x] Run `rtk bun test` and confirm the full suite passes.
- [x] Run `rtk bun run build` and confirm the production build passes.
- [x] Run `rtk git diff --check` and review the diff against the spec.
