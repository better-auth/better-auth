import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parse, parseDocument } from "yaml";

export function parseCatalogSpec(
	version: string,
): { catalogName?: string } | null {
	if (!version.startsWith("catalog:")) {
		return null;
	}
	const catalogName = version.slice("catalog:".length);
	return catalogName ? { catalogName } : {};
}

export function getPnpmWorkspaceYamlPath(workspaceRoot: string): string {
	return path.join(workspaceRoot, "pnpm-workspace.yaml");
}

export async function findPnpmWorkspaceRoot(
	startDir: string,
): Promise<string | null> {
	let currentDir = path.resolve(startDir);
	const root = path.parse(currentDir).root;

	while (currentDir !== root) {
		if (existsSync(getPnpmWorkspaceYamlPath(currentDir))) {
			return currentDir;
		}
		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			break;
		}
		currentDir = parentDir;
	}

	return null;
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
	const trimmed = currentCatalogVersion.trim();
	if (trimmed.startsWith("^")) {
		return `^${target}`;
	}
	if (trimmed.startsWith("~")) {
		return `~${target}`;
	}
	if (trimmed.startsWith(">=")) {
		return `>=${target}`;
	}
	if (trimmed.startsWith("<=")) {
		return `<=${target}`;
	}
	if (trimmed.startsWith(">")) {
		return `>${target}`;
	}
	if (trimmed.startsWith("<")) {
		return `<${target}`;
	}
	if (trimmed === "*") {
		return trimmed;
	}
	return target;
}

export function setPnpmCatalogVersion(
	workspaceYamlPath: string,
	packageName: string,
	newVersion: string,
	catalogName?: string,
): void {
	const content = readFileSync(workspaceYamlPath, "utf-8");
	const doc = parseDocument(content);

	if (catalogName) {
		doc.setIn(["catalogs", catalogName, packageName], newVersion);
	} else {
		doc.setIn(["catalog", packageName], newVersion);
	}

	writeFileSync(workspaceYamlPath, String(doc));
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

	const workspaceRoot = await findPnpmWorkspaceRoot(cwd);
	if (!workspaceRoot) {
		return null;
	}

	const workspaceYamlPath = getPnpmWorkspaceYamlPath(workspaceRoot);
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
