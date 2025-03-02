import path from "path";
import fs from "fs-extra";

export function stripJsonComments(jsonString: string): string {
	return jsonString
		.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) =>
			g ? "" : m,
		)
		.replace(/,(?=\s*[}\]])/g, "");
}

export function getTsconfigInfo(cwd?: string) {
	const packageJsonPath = cwd
		? path.join(cwd, "tsconfig.json")
		: path.join("tsconfig.json");
	try {
		const text = fs.readFileSync(packageJsonPath, "utf-8");
		return JSON.parse(stripJsonComments(text));
	} catch (error) {
		throw error;
	}
}
