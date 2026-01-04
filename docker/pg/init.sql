CREATE DATABASE drizzle_better_auth;
CREATE DATABASE better_auth;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'appuser') THEN
    CREATE ROLE appuser LOGIN PASSWORD 'password';
  END IF;
END $$;

GRANT ALL PRIVILEGES ON DATABASE better_auth TO "user";
GRANT ALL PRIVILEGES ON DATABASE drizzle_better_auth TO "user";

ALTER DATABASE better_auth OWNER TO "user";
ALTER DATABASE drizzle_better_auth OWNER TO "user";