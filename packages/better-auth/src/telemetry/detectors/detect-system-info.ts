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
		env.CI !== "false" && // Bypass all checks if CI env is explicitly set to 'false'
		(env.BUILD_ID || // Jenkins, Cloudbees
			env.BUILD_NUMBER || // Jenkins, TeamCity
			env.CI || // Travis CI, CircleCI, Cirrus CI, Gitlab CI, Appveyor, CodeShip, dsari, Cloudflare Pages/Workers
			env.CI_APP_ID || // Appflow
			env.CI_BUILD_ID || // Appflow
			env.CI_BUILD_NUMBER || // Appflow
			env.CI_NAME || // Codeship and others
			env.CONTINUOUS_INTEGRATION || // Travis CI, Cirrus CI
			env.RUN_ID || // TaskCluster, dsari
			false)
	);
}
