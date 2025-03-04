import { existsSync } from "fs";
import path from "path";

let possiblePaths = ["auth.ts", "auth.tsx", "auth.js", "auth.jsx"];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server/${it}`),
	...possiblePaths.map((it) => `lib/auth/${it}`),
	...possiblePaths.map((it) => `server/${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `src/app/${it}`),
	...possiblePaths.map((it) => `app/${it}`),
];

export async function findAuthConfig(cwd: string) {
	for (const possiblePath of possiblePaths) {
		const doesExist = existsSync(path.join(cwd, possiblePath));
		if (doesExist) {
			return path.join(cwd, possiblePath);
		}
	}
	return null;
}
