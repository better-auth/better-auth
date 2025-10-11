import fs from "fs";
import path from "path";

export function getPackageInfo(cwd?: string) {
	const packageJsonPath = cwd
		? path.join(cwd, "package.json")
		: path.join("package.json");
	return JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
}
