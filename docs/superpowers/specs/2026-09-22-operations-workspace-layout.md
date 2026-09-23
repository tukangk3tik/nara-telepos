# Operations Workspace Layout

## Goal

Redesign every client route around the existing Clean Slate theme while preserving every API call, action, permission rule, and route.

## Layout system

- Give each route a consistent title and supporting context, with a responsive page width.
- Use compact card sections for summaries, forms, and secondary details.
- Keep data views in the existing Table primitives; allow horizontal scrolling on narrow screens.
- Keep the current sidebar navigation and all existing controls.

## Route changes

- **Dashboard:** emphasize the daily totals, then place recent activity and low stock in a responsive two-column workspace.
- **POS:** preserve product search and checkout actions; make the catalogue and checkout panels clearer on desktop and naturally stack on small screens.
- **Sales and expenses:** introduce page headers and make list/detail regions easier to scan without changing their actions.
- **Settings:** retain the tabs and forms, but use a more deliberate responsive admin grid and clearer section spacing.

## Out of scope

- No new routes, APIs, state, dependencies, navigation model, or dark-mode toggle.
- No data-table sorting, filtering, pagination, or bulk actions.

## Verification

- Update focused client layout assertions where they protect the new page structure.
- Run the full Bun test suite and production build.
