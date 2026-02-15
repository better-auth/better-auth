import { readdirSync } from "node:fs";
import type { Awaitable } from "@better-auth/core";
import type { PackageJson } from "type-fest";
import { hasDependency } from "../../../utils/get-package-info";
import type { Framework } from "../configs/frameworks.config";
import { FRAMEWORKS } from "../configs/frameworks.config";

export async function detectFramework(cwd: string, packageJson: PackageJson) {
	for (const strategy of [packageJsonStrategy, fileStrategy]) {
		const result = await strategy({ cwd, packageJson });
		if (result !== null) {
			return result;
		}
	}
	return null;
}

type Strategy = (ctx: {
	cwd: string;
	packageJson: PackageJson;
}) => Awaitable<Framework | null>;

const packageJsonStrategy: Strategy = ({ packageJson }) => {
	for (const framework of FRAMEWORKS) {
		if (hasDependency(packageJson, framework.dependency)) {
			return framework;
		}
	}
	return null;
};

const fileStrategy: Strategy = ({ cwd }) => {
	const cwdFiles = readdirSync(cwd);

	for (const framework of FRAMEWORKS) {
		if (!framework.configPaths?.length) {
			continue;
		}

		for (const configPath of framework.configPaths) {
			if (cwdFiles.includes(configPath)) {
				return framework;
			}
		}
	}

	return null;
};
