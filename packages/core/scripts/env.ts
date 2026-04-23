import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf-8"),
);

const FILENAME = new URL("../dist/constants.js", import.meta.url);

const file = await readFile(FILENAME, "utf-8");

writeFile(
	FILENAME,
	file
		.replace('"BETTER_AUTH_VERSION"', JSON.stringify(packageJson.version))
		.replace(
			'"BETTER_AUTH_TELEMETRY_ENDPOINT"',
			JSON.stringify(process.env.BETTER_AUTH_TELEMETRY_ENDPOINT ?? ""),
		),
);
