# Deleted Expenses View Design

## Goal

Separate active and deleted expenses while keeping the current search and pagination flow.

## Behavior

- `/expenses` shows only active expenses. It has New expense, Details, and administrator Delete actions.
- A View deleted expenses button opens `/expenses/deleted`, which shows only deleted expenses with search, pagination, and Details. A back button returns to `/expenses`.
- Keep the view-switch button beside the page heading, outside the table card. The table card has no title; its header places the Search expenses label and input inline at the top-left and, on the active view, New expense at the right.
- Deleting an expense keeps the user on `/expenses`; the row disappears from that list after refresh.
- Expense numbers are plain text. Details sits beside Delete in the actions column.
- Details opens a right-side dialog matching the `/sales` detail layout, including date, category, amount, notes, and deletion reason when present.
- The sidebar keeps Expenses active on both routes. No server API changes are needed; existing actor access restrictions remain.

## Checks

Test both routes, list filtering, action placement, and dialog presentation. Run the full test suite and production build.
