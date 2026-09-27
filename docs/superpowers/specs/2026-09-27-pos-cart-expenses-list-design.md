# POS Cart and Expenses List Design

## Goal

Make the `/pos` cart action compact and make `/expenses` a full-width list for finding expenses and adding new ones.

## POS cart

Replace each cart row's Remove text with a trash icon. Keep the existing removal callback and an accessible label that names the product.

## Expenses

- Keep the existing `/api/expenses` response and its actor-based visibility. Search and pagination run in the browser over the returned list.
- Show one full-width Expense history card. Put the search field and New expense button above its table.
- Search expense number, category, transaction date, and notes case-insensitively. Include deleted rows in search results as they are today.
- Show 10 filtered rows per page with Previous and Next controls and a page indicator. Changing the query returns to page 1. An empty result has a clear no-data message.
- Move the current create form into a New expense dialog. Preserve fields, validation, API submission, and errors. Close the dialog after a successful creation and refresh the list.
- Preserve the expense detail view below the table and the existing admin Delete dialog and action.

## Constraints and checks

Use existing Svelte UI components and Lucide icons. Add no dependency or server endpoint. Keep the responsive single-column layout and keyboard-accessible controls. Verify the focused UI test, full test suite, and production build.
