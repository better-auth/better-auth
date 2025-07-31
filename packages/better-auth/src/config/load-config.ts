import fs from "node:fs/promises";
import path from "node:path";

async function ensureDir(configPath: string) {
	const dir = path.dirname(configPath);
	await fs.mkdir(dir, { recursive: true });
}

export async function loadConfig(
	configPath: string,
): Promise<Record<string, string | undefined>> {
	await ensureDir(configPath);
	const configExists = await fs.exists(configPath);

	if (configExists) {
		const contents = (await fs.readFile(configPath)).toString();
		const store = JSON.parse(contents);
		return store;
	} else {
		const store = {};
		const contents = JSON.stringify(store, null, "\t");
		await fs.writeFile(configPath, contents);
		return store;
	}
}
