# Better Auth — Docker server example

A self-hosted Better Auth server in a container, with PostgreSQL and a one-off
schema migration, orchestrated by `docker-compose`.

For the full walkthrough and production notes, see the
[Deploy with Docker guide](https://better-auth.com/docs/guides/docker-deployment).

## Files

| File | Purpose |
| --- | --- |
| `auth.ts` | Better Auth config (PostgreSQL via `DATABASE_URL`) |
| `server.ts` | Express server mounting the Better Auth handler |
| `Dockerfile` | Container image (runs `server.ts` with `tsx`) |
| `docker-compose.yml` | `db` + one-off `migrate` + `app` |
| `.env.example` | Required environment variables |

## Run

```bash
cp .env.example .env
# then set BETTER_AUTH_SECRET (openssl rand -base64 32) and DB_PASSWORD

docker compose up -d --build
```

The `migrate` service applies the schema, then `app` starts on
[http://localhost:3000](http://localhost:3000). Verify it's up:

```bash
curl http://localhost:3000/api/auth/ok
```

## Notes

- `migrate` uses the CLI, which applies the schema directly — this works with
  the built-in Kysely adapter. For Prisma or Drizzle, run your ORM's migration
  tool instead.
- Never commit a real `.env`. Pass secrets from your orchestrator in production.
- Put a TLS-terminating reverse proxy in front of the container and set
  `BETTER_AUTH_URL` to the public HTTPS URL.
