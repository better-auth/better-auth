import path from "path";
import fs from "fs-extra";

export function getTsconfigInfo(cwd?: string) {
	const packageJsonPath = cwd
		? path.join(cwd, "tsconfig.json")
		: path.join("tsconfig.json");
	try {
		return fs.readJSONSync(packageJsonPath);
	} catch (error) {
		throw error;
	}
}
