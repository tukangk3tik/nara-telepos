# Shadcn Slate UI Design

## Goal

Replace the custom client CSS with a plain slate shadcn-svelte admin interface while retaining all TelePOS routes, workflows, API contracts, and permissions.

## Scope

The migration covers the application shell, sign-in, POS, cart, customer selection and creation, sales history and detail, expenses, and settings. The Bun/Hono server, SQLite schema, route contracts, and Telegram integration do not change.

## Foundation

The Vite/Svelte 5 client will use the current shadcn-svelte Vite setup: Tailwind CSS, a `$lib` path alias, and the slate CSS-variable theme. The repository will contain only the generated primitives required by the application: Alert, Badge, Button, Card, Dialog, Input, Label, Select, Table, Tabs, and Textarea. No component library is installed as a runtime dependency; shadcn-svelte generates the component source into the repository.

## Layout and navigation

Authenticated users see a neutral slate administration shell: compact header on small screens and a persistent navigation rail on larger screens. Navigation remains POS, Sales, Expenses, and the admin-only Settings item. Existing history-based navigation and direct URL behavior stay intact.

Unauthenticated users see a centered sign-in card. The client remains a single Vite SPA served by Hono; this change does not introduce SvelteKit.

## Screen mappings

- **POS:** product search and product rows become cards/list rows; cart, customer controls, payment selection, and receipt use Cards, Inputs, Select, Buttons, and alerts.
- **Sales:** history remains tabular using Table; payment and cancellation status use Badges. Sale detail uses a Card. Cancellation moves from `prompt()` to a Dialog requiring a reason.
- **Expenses:** the creation form and selected expense remain side-by-side on wide screens and stack on mobile, using Card, Select, Input, Textarea, and Table/list styling.
- **Settings:** settings groups use Tabs and Cards. Product, customer, category, staff, Telegram, and profile actions preserve their existing form requests and role rules. Stock adjustment and Telegram-link removal move from browser prompts/confirms to Dialogs.

## Behavior and accessibility

All current form constraints, disabled states, error messages, success messages, focusable controls, labels, and `role=alert`/`role=status` feedback remain. Dialogs require explicit confirmation and preserve the current cancellation/stock-adjustment validation before requests are sent. The layout uses semantic navigation, responsive grids, and horizontally scrollable data tables on narrow screens.

## Validation

Client behavior is unchanged, so existing server tests remain the regression suite. Add focused client-level checks for the extracted dialog validation helpers before changing their callers. Run `bun test` and `bun run build`; perform the README manual smoke flow locally to confirm sign-in, sale completion, cancellation, expense creation, and settings actions.
