import os from "node:os";
import { name as ciName } from "ci-info";
import isDocker from "is-docker";
import isWSL from "is-wsl";

import type { SystemInfo } from "../types";

export async function detectSystem(): Promise<SystemInfo> {
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
		isDocker: isDocker(),
		isTTY: process.stdout.isTTY,
		isWSL,
		ciName,
	};
}
