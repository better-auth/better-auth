import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { findMonorepoRoot } from "./get-package-info";

export function parseCatalogSpec(
	version: string,
): { catalogName?: string } | null {
	if (!version.startsWith("catalog:")) {
		return null;
	}
	const catalogName = version.slice("catalog:".length);
	return catalogName ? { catalogName } : {};
}

export function getPnpmWorkspaceYamlPath(monorepoRoot: string): string {
	return path.join(monorepoRoot, "pnpm-workspace.yaml");
}

type WorkspaceYaml = {
	catalog?: Record<string, string>;
	catalogs?: Record<string, Record<string, string>>;
};

function readWorkspaceYaml(workspaceYamlPath: string): WorkspaceYaml {
	return parse(readFileSync(workspaceYamlPath, "utf-8")) as WorkspaceYaml;
}

export function getPnpmCatalogVersion(
	workspaceYamlPath: string,
	packageName: string,
	catalogName?: string,
): string | null {
	const workspace = readWorkspaceYaml(workspaceYamlPath);
	if (catalogName) {
		return workspace.catalogs?.[catalogName]?.[packageName] ?? null;
	}
	return workspace.catalog?.[packageName] ?? null;
}

export function formatCatalogTargetVersion(
	currentCatalogVersion: string,
	target: string,
): string {
	if (currentCatalogVersion.startsWith("^")) {
		return `^${target}`;
	}
	if (currentCatalogVersion.startsWith("~")) {
		return `~${target}`;
	}
	return target;
}

export function setPnpmCatalogVersion(
	workspaceYamlPath: string,
	packageName: string,
	newVersion: string,
	catalogName?: string,
): void {
	const workspace = readWorkspaceYaml(workspaceYamlPath);
	if (catalogName) {
		workspace.catalogs ??= {};
		workspace.catalogs[catalogName] ??= {};
		workspace.catalogs[catalogName][packageName] = newVersion;
	} else {
		workspace.catalog ??= {};
		workspace.catalog[packageName] = newVersion;
	}
	writeFileSync(workspaceYamlPath, stringify(workspace));
}

export async function resolveCatalogDependencyVersion(
	cwd: string,
	packageName: string,
	versionSpec: string,
): Promise<{ version: string; catalogName?: string } | null> {
	const catalogSpec = parseCatalogSpec(versionSpec);
	if (!catalogSpec) {
		return null;
	}

	const monorepoRoot = await findMonorepoRoot(cwd);
	if (!monorepoRoot) {
		return null;
	}

	const workspaceYamlPath = getPnpmWorkspaceYamlPath(monorepoRoot);
	const catalogVersion = getPnpmCatalogVersion(
		workspaceYamlPath,
		packageName,
		catalogSpec.catalogName,
	);
	if (!catalogVersion) {
		return null;
	}

	return {
		version: catalogVersion,
		catalogName: catalogSpec.catalogName,
	};
}
