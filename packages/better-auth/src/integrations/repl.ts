import { stat } from "node:fs/promises";
import { join } from "node:path";
import { config } from "dotenv";

let possiblePaths = [
	"auth.ts",
	"auth.tsx",
	"auth.js",
	"auth.jsx",
	"auth.server.js",
	"auth.server.ts",
	"auth/index.ts",
	"auth/index.tsx",
	"auth/index.js",
	"auth/index.jsx",
	"auth/index.server.js",
	"auth/index.server.ts",
];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server/${it}`),
	...possiblePaths.map((it) => `server/auth/${it}`),
	...possiblePaths.map((it) => `server/${it}`),
	...possiblePaths.map((it) => `auth/${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `app/${it}`),
];

config({
	path: [".env", ".env.local"],
});

(async () => {
	const dir = process.cwd();
	const found = (
		await Promise.all(
			possiblePaths.map(async (it): Promise<string | false> => {
				try {
					const path = join(dir, it);
					await stat(path);
					return path;
				} catch (_e) {
					return false;
				}
			}),
		)
	)
		.filter((it) => it !== false)
		.at(0);

	if (!found) {
		throw new Error("No auth file found");
	}

	const { auth } = await import(found);

	Object.defineProperty(auth, "default", {
		get: () => auth,
	});
})().catch((e) => {
	console.error("Error while loading auth file: ", e);
});
