./node_modules/.bin/cli generate --output src/db-schema.generated.ts --config ./src/test-config.ts

# The drizzle-schema created uses the public schema by default, so we swap
# pgTable(...) calls with enterpriseSchema.table(...)
sed -i '' 's/pgTable(/enterpriseSchema.table(/g' src/db-schema.generated.ts

# Add the enterprise schema import to the generated file
sed -i '' $'1i\\\nimport { enterpriseSchema } from "./db-schema.default"\n' src/db-schema.generated.ts

bunx drizzle-kit generate