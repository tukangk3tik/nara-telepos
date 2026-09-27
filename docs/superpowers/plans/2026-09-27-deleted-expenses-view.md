# Deleted Expenses View Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `/expenses/deleted` and move expense details into a right-side dialog.

**Architecture:** Reuse the current `Expenses.svelte` list and API. Route both URLs through it with a `deleted` prop, and key the route by URL to reset search and page state when switching views.

**Tech Stack:** Svelte 5, TypeScript, existing Dialog and Table components, Bun tests.

**Spec:** `docs/superpowers/specs/2026-09-27-deleted-expenses-view-design.md`

## Tasks

- [x] Add a failing UI test for `/expenses/deleted`, sidebar active state, and the distinct page title; update `App.svelte` and `AppSidebar.svelte`, then rerun the test.
- [x] Add a failing UI test for active/deleted list filtering, switch buttons, and plain expense numbers with Details beside Delete; update `Expenses.svelte`, then rerun the test.
- [x] Add a failing UI test for the right-side detail dialog and remove the inline detail article; update `Expenses.svelte`, then rerun the test.
- [x] Run `rtk bun test`, `rtk bun run build`, and `rtk git diff --check`; review against the spec.
