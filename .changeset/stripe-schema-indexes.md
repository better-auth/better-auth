---
"@better-auth/stripe": patch
---

Add database indexes to frequently queried Stripe lookup fields (`subscription.referenceId`, `subscription.stripeCustomerId`, `subscription.stripeSubscriptionId`, `user.stripeCustomerId`, and `organization.stripeCustomerId`) to prevent full-table scans.

> Note: `getMigrations` generates indexes for newly created tables and columns. Existing databases will not receive these indexes automatically on upgrade.
> - **PostgreSQL:** Consider adding indexes concurrently (`CREATE INDEX CONCURRENTLY`) on high-volume production tables.
> - **MySQL:** Manual index creation requires a key prefix length (e.g. `referenceId(191)`). For Drizzle on MySQL, the generator emits `varchar(255)` instead of `text` for indexed columns, which causes `drizzle-kit` to generate a `MODIFY COLUMN` statement.
