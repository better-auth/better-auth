import type { PackageJson } from "type-fest";
let packageJSONCache: PackageJson | undefined;

async function readRootPackageJson() {
	if (packageJSONCache) return packageJSONCache;
	try {
		const cwd =
			typeof process !== "undefined" && typeof process.cwd === "function"
				? process.cwd()
				: "";
		if (!cwd) return undefined;
		// Lazily import Node built-ins only when available (Node/Bun/Deno) and
		// avoid static analyzer/bundler resolution by obfuscating module names
		const importRuntime = (m: string) =>
			(Function("mm", "return import(mm)") as any)(m);
		const [{ default: fs }, { default: path }] = await Promise.all([
			importRuntime("fs/promises"),
			importRuntime("path"),
		]);
		const raw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
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
		const cwd =
			typeof process !== "undefined" && typeof process.cwd === "function"
				? process.cwd()
				: "";
		if (!cwd) throw new Error("no-cwd");
		const importRuntime = (m: string) =>
			(Function("mm", "return import(mm)") as any)(m);
		const [{ default: fs }, { default: path }] = await Promise.all([
			importRuntime("fs/promises"),
			importRuntime("path"),
		]);
		const pkgJsonPath = path.join(cwd, "node_modules", pkg, "package.json");
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
