/**
 * Shared GitHub CLI and CI output helpers.
 *
 * Used by: auto-changeset.ts, release-notes.ts
 */

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";

export const REPO = process.env.GITHUB_REPOSITORY ?? "better-auth/better-auth";

export function gh(args: string[]): string {
	return execFileSync("gh", args, {
		encoding: "utf-8",
		env: { ...process.env, GH_TOKEN: process.env.GITHUB_TOKEN },
	}).trim();
}

export function ghJSON<T>(args: string[]): T {
	return JSON.parse(gh(args)) as T;
}

export function setOutput(key: string, value: string): void {
	const outputFile = process.env.GITHUB_OUTPUT;
	if (outputFile) {
		const delim = `GHEOF_${randomBytes(8).toString("hex")}`;
		appendFileSync(outputFile, `${key}<<${delim}\n${value}\n${delim}\n`);
	}
	console.log(
		`  ${key}: ${value.length > 100 ? `${value.slice(0, 100)}...` : value}`,
	);
}
