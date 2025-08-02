import fs from "node:fs";
import os from "node:os";
import process from "node:process";

import type { SystemInfo } from "../types";

export async function detectSystemInfo(): Promise<SystemInfo> {
	const cpus = os.cpus() || [];

	return {
		// Software information
		systemPlatform: os.platform(),
		systemRelease: os.release(),
		systemArchitecture: os.arch(),

		// Machine information
		cpuCount: cpus.length,
		cpuModel: cpus.length ? cpus[0].model : null,
		cpuSpeed: cpus.length ? cpus[0].speed : null,
		memory: os.totalmem(),

		// Environment information
		isCI: isCI(),
		isWSL: isWsl(),
		isDocker: isDocker(),
		isTTY: process.stdout.isTTY,
	};
}

let isDockerCached: boolean | undefined;

function hasDockerEnv() {
	try {
		fs.statSync("/.dockerenv");
		return true;
	} catch {
		return false;
	}
}

function hasDockerCGroup() {
	try {
		return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
	} catch {
		return false;
	}
}

function isDocker() {
	if (isDockerCached === undefined) {
		isDockerCached = hasDockerEnv() || hasDockerCGroup();
	}

	return isDockerCached;
}

function isWsl() {
	if (process.platform !== "linux") {
		return false;
	}

	if (os.release().toLowerCase().includes("microsoft")) {
		if (isInsideContainer()) {
			return false;
		}

		return true;
	}

	try {
		return fs
			.readFileSync("/proc/version", "utf8")
			.toLowerCase()
			.includes("microsoft")
			? !isInsideContainer()
			: false;
	} catch {
		return false;
	}
}

let isInsiderContainerCached: boolean | undefined;

const hasContainerEnv = () => {
	try {
		fs.statSync("/run/.containerenv");
		return true;
	} catch {
		return false;
	}
};

function isInsideContainer() {
	if (isInsiderContainerCached === undefined) {
		isInsiderContainerCached = hasContainerEnv() || isDocker();
	}

	return isInsideContainer;
}

function isCI() {
	const env = process.env;

	return (
		env.CI !== "false" &&
		("BUILD_ID" in env || // Jenkins, Cloudbees
			"BUILD_NUMBER" in env || // Jenkins, TeamCity (fixed typo: extra space removed)
			"CI" in env || // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari, Cloudflare
			"CI_APP_ID" in env || // Appflow
			"CI_BUILD_ID" in env || // Appflow
			"CI_BUILD_NUMBER" in env || // Appflow
			"CI_NAME" in env || // Codeship and others
			"CONTINUOUS_INTEGRATION" in env || // Travis CI, Cirrus CI
			"RUN_ID" in env) // TaskCluster, dsari
	);
}
