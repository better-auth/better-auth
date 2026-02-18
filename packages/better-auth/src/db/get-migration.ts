/**
 * Get the current PostgreSQL schema (search_path) for the database connection
 * Returns the first schema in the search_path, defaulting to 'public' if not found
 */
async function getPostgresSchema(db: Kysely<unknown>): Promise<string> {
	try {
		const result = await sql<{ search_path: string }>`SHOW search_path`.execute(
			db,
		);
		if (result.rows[0]?.search_path) {
			// search_path can be a comma-separated list like "$user, public" or '"$user", public'
			// Supabase may return escaped format like '"\$user", public'
			// We want the first non-variable schema
			const schemas = result.rows[0].search_path
				.split(",")
				.map((s) => s.trim())
				// Remove quotes and filter out variables like $user
				.map((s) => s.replace(/^["']|["']$/g, ""))
				// Filter out variable references like $user, \$user (escaped)
				.filter((s) => !s.startsWith("$") && !s.startsWith("\\$"));
			return schemas[0] || "public";
		}
	} catch {
		// If query fails, fall back to public schema
	}
	return "public";
}
