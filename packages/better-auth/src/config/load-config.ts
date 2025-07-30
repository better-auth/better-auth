import fs from "node:fs";
import path from "node:path";

function ensureDir(configPath: string) {
	const dir = path.dirname(configPath);
	fs.mkdirSync(dir, { recursive: true });
}

export function loadConfig(configPath: string): Record<string, string> {
	ensureDir(configPath);
	const configExists = fs.existsSync(configPath);

	if (configExists) {
		const contents = fs.readFileSync(configPath).toString();
		const store = JSON.parse(contents);
		return store;
	} else {
		const store = {};
		const contents = JSON.stringify(store, null, "\t");
		fs.writeFileSync(configPath, contents);
		return store;
	}
}
