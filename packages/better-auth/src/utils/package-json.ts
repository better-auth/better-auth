import fs from "fs/promises";
import path from "path";

export async function readPackageJson(pkg: string) {
	try {
		const packageJson = await import(path.join(process.cwd(), "package.json"));
		return packageJson;
	} catch {}
	return undefined;
}

export async function getVersionFromLocalPackageJson(pkg: string) {
	try {
		const raw = await fs.readFile(
			path.join(process.cwd(), "package.json"),
			"utf-8",
		);
		const json = JSON.parse(raw);
		const allDeps = {
			...json.dependencies,
			...json.devDependencies,
			...json.peerDependencies,
		};
		return allDeps[pkg] as string;
	} catch {}
	return undefined;
}

export async function getNameFromLocalPackageJson() {
	try {
		const raw = await fs.readFile(
			path.join(process.cwd(), "package.json"),
			"utf-8",
		);
		const json = JSON.parse(raw);
		return json.name as string;
	} catch {}
	return undefined;
}
