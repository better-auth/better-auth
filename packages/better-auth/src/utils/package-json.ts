import fs from "fs/promises";
import path from "path";
import type { PackageJson } from "type-fest";
let packageJSONCache: PackageJson | undefined;

async function readRootPackageJson() {
	if (packageJSONCache) return packageJSONCache;
	try {
		const raw = await fs.readFile(
			path.join(process.cwd(), "package.json"),
			"utf-8",
		);
		packageJSONCache = JSON.parse(raw);
		return packageJSONCache as PackageJson;
	} catch {}
	return undefined;
}

export async function getPackageVersion(pkg: string) {
	if (packageJSONCache) {
		return (packageJSONCache.dependencies?.[pkg] ||
			packageJSONCache.devDependencies?.[pkg] ||
			packageJSONCache.peerDependencies?.[pkg]) as string | undefined;
	}

	try {
		const pkgJsonPath = path.join(
			process.cwd(),
			"node_modules",
			pkg,
			"package.json",
		);
		const raw = await fs.readFile(pkgJsonPath, "utf-8");
		const json = JSON.parse(raw);
		const resolved =
			(json.version as string) ||
			(await getVersionFromLocalPackageJson(pkg)) ||
			undefined;
		return resolved;
	} catch {}

	const fromRoot = await getVersionFromLocalPackageJson(pkg);
	return fromRoot;
}

async function getVersionFromLocalPackageJson(pkg: string) {
	const json = await readRootPackageJson();
	if (!json) return undefined;
	const allDeps = {
		...json.dependencies,
		...json.devDependencies,
		...json.peerDependencies,
	} as Record<string, string | undefined>;
	return allDeps[pkg];
}

export async function getNameFromLocalPackageJson() {
	const json = await readRootPackageJson();
	return json?.name as string | undefined;
}
