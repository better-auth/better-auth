---
"@better-auth/sso": patch
---

<!-- cspell:ignore fkey -->

Deleting the user who registered an SSO provider no longer deletes the provider. `ssoProvider.userId` is now optional and its foreign key uses `on delete set null`, so an organization's SSO connection survives the departure of the member who set it up.

`auth migrate` does not alter an existing column or foreign key, so an existing database keeps `userId` required and `on delete cascade` until it is migrated by hand. The statements below assume the default table and column names; use yours if you set `modelName` or `fields`. With Prisma or Drizzle, run `auth generate` and create the migration with your own tool instead.

PostgreSQL (`ssoProvider_userId_fkey` is the name Postgres gave the constraint `auth migrate` created; check yours with `\d "ssoProvider"`):

```sql
BEGIN;
ALTER TABLE "ssoProvider" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "ssoProvider" DROP CONSTRAINT "ssoProvider_userId_fkey";
ALTER TABLE "ssoProvider" ADD CONSTRAINT "ssoProvider_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE SET NULL;
COMMIT;
```

MySQL: find the constraint first. If the query returns no row, the database has no foreign key on this column (MySQL before 9.0 ignores a `REFERENCES` written inside a column definition, which is how `auth migrate` writes it): skip the `DROP FOREIGN KEY`, and run the `UPDATE` before adding the constraint, because a `userId` whose user was already deleted would make `ADD CONSTRAINT` fail. In the `MODIFY`, keep the type `SHOW CREATE TABLE ssoProvider` shows for `userId` and drop only `NOT NULL`: `varchar(36)` is the default string id; with `advanced.database.generateId: "serial"` it is `int`.

```sql
SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ssoProvider'
    AND COLUMN_NAME = 'userId' AND REFERENCED_TABLE_NAME = 'user';
ALTER TABLE `ssoProvider` DROP FOREIGN KEY `<name from the query>`;
ALTER TABLE `ssoProvider` MODIFY `userId` varchar(36) NULL;
UPDATE `ssoProvider` SET `userId` = NULL
  WHERE `userId` IS NOT NULL AND `userId` NOT IN (SELECT `id` FROM `user`);
ALTER TABLE `ssoProvider` ADD CONSTRAINT `ssoProvider_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE SET NULL;
```

SQLite cannot alter a foreign key, so the table is rebuilt ([SQLite: making other kinds of table schema changes](https://www.sqlite.org/lang_altertable.html#otheralter)). Copy your own `CREATE TABLE` from `.schema ssoProvider`, rename it to `ssoProvider_new`, and change only the `userId` line: remove `not null` and make it `on delete set null`. The statement below is the default column set with string ids, as an example. With `generateId: "serial"`, `id` stays `integer not null primary key` and `userId` is `integer`; if `.schema` shows more columns (for example `domainVerified` with `domainVerification.enabled`), list them in the `INSERT` too.

```sql
PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE "ssoProvider_new" (
  "id" text not null primary key,
  "issuer" text not null,
  "oidcConfig" text,
  "samlConfig" text,
  "userId" text references "user" ("id") on delete set null,
  "providerId" text not null unique,
  "organizationId" text,
  "domain" text not null
);
INSERT INTO "ssoProvider_new" ("id", "issuer", "oidcConfig", "samlConfig", "userId", "providerId", "organizationId", "domain")
  SELECT "id", "issuer", "oidcConfig", "samlConfig", "userId", "providerId", "organizationId", "domain" FROM "ssoProvider";
DROP TABLE "ssoProvider";
ALTER TABLE "ssoProvider_new" RENAME TO "ssoProvider";
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys = ON;
```
