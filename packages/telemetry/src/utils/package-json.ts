import type { PackageJson } from "type-fest";

// In the default (non-node) build, filesystem access is not available.
// The node build (src/node.ts) provides its own inline implementation
// using static top-level imports of node:fs/promises and node:path.

export async function getPackageVersion(
	_pkg: string,
): Promise<string | undefined> {
	return undefined;
}

export async function getNameFromLocalPackageJson(): Promise<
	string | undefined
> {
	return undefined;
}

// Kept for API compatibility — always returns undefined in the default build.
export async function readRootPackageJson(): Promise<PackageJson | undefined> {
	return undefined;
}
