# Better Auth Aurora DSQL Adapter

An isolated Aurora DSQL adapter that reuses Better Auth's PostgreSQL/Kysely operations and migration planner.

```sh
pnpm add @better-auth/dsql-adapter kysely
```

Use `dsqlDialect` with your maintained PostgreSQL connector and pass `dsqlAdapter(db)` to Better Auth. The adapter implements `auth generate` and `auth migrate` through shared adapter hooks. Run migrations separately from requests. For programmatic migrations, use `getDsqlMigrations` from `@better-auth/dsql-adapter/migration`.

See the [Aurora DSQL documentation](https://www.better-auth.com/docs/adapters/postgresql#amazon-aurora-dsql) for IAM connection setup, retries, storage, and migration limitations.

MIT
