import pg from "pg";

const { Pool } = pg;

const connectionString = "postgres://user:password@localhost:5432/better_auth";

async function main() {
	const mode = process.env.TEST_MODE;
	const pool = new Pool({ connectionString });
	const client = await pool.connect();

	try {
		if (mode === "setup") {
			await client.query("DROP TABLE IF EXISTS naive_ts;");
			await client.query("DROP TABLE IF EXISTS tz_ts;");
			await client.query("CREATE TABLE naive_ts (created_at timestamp);");
			await client.query(
				"CREATE TABLE tz_ts (created_at timestamp with time zone);",
			);
			console.log(JSON.stringify({ success: true }));
		} else if (mode === "write") {
			const utcDate = new Date("2026-06-08T12:00:00.000Z");
			await client.query("DELETE FROM naive_ts;");
			await client.query("DELETE FROM tz_ts;");
			await client.query("INSERT INTO naive_ts (created_at) VALUES ($1);", [
				utcDate,
			]);
			await client.query("INSERT INTO tz_ts (created_at) VALUES ($1);", [
				utcDate,
			]);
			console.log(JSON.stringify({ success: true }));
		} else if (mode === "read") {
			const naiveRes = await client.query(
				"SELECT created_at, created_at::text as raw_text FROM naive_ts;",
			);
			const tzRes = await client.query(
				"SELECT created_at, created_at::text as raw_text FROM tz_ts;",
			);

			const naiveDate = naiveRes.rows[0].created_at;
			const naiveRawText = naiveRes.rows[0].raw_text;
			const tzDate = tzRes.rows[0].created_at;
			const tzRawText = tzRes.rows[0].raw_text;

			console.log(
				JSON.stringify({
					rawText: { naive: naiveRawText, tz: tzRawText },
					unixTimestamp: { naive: naiveDate.getTime(), tz: tzDate.getTime() },
					isoString: {
						naive: naiveDate.toISOString(),
						tz: tzDate.toISOString(),
					},
				}),
			);
		} else if (mode === "verify_types") {
			const colTypesQuery = await client.query(`
				SELECT table_name, column_name, data_type 
				FROM information_schema.columns 
				WHERE table_name IN ('naive_ts', 'tz_ts') AND column_name = 'created_at';
			`);
			console.log(JSON.stringify(colTypesQuery.rows));
		}
	} finally {
		client.release();
		await pool.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
