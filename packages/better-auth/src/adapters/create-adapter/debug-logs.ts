import { logger } from "../../utils";
import type { AdapterConfig } from "./types";

export const initDebugLogs = ({
	config,
	debugLogs,
}: { config: AdapterConfig; debugLogs: any[] }) => {
	return (...args: any[]) => {
		if (config.debugLogs === true || typeof config.debugLogs === "object") {
			// If we're running adapter tests, we'll keep debug logs in memory, then print them out if a test fails.
			if (
				typeof config.debugLogs === "object" &&
				"isRunningAdapterTests" in config.debugLogs
			) {
				if (config.debugLogs.isRunningAdapterTests) {
					args.shift(); // Removes the {method: "..."} object from the args array.
					debugLogs.push(args);
				}
				return;
			}

			if (
				typeof config.debugLogs === "object" &&
				config.debugLogs.logCondition &&
				!config.debugLogs.logCondition()
			) {
				return;
			}

			if (typeof args[0] === "object" && "method" in args[0]) {
				const method = args.shift().method;
				// Make sure the method is enabled in the config.
				if (typeof config.debugLogs === "object") {
					// If any one of these combinations are false, we don't want to log anything.
					if (method === "create" && !config.debugLogs.create) {
						return;
					}
					if (method === "update" && !config.debugLogs.update) {
						return;
					}
					if (method === "updateMany" && !config.debugLogs.updateMany) {
						return;
					}
					if (method === "findOne" && !config.debugLogs.findOne) {
						return;
					}
					if (method === "findMany" && !config.debugLogs.findMany) {
						return;
					}
					if (method === "delete" && !config.debugLogs.delete) {
						return;
					}
					if (method === "deleteMany" && !config.debugLogs.deleteMany) {
						return;
					}
					if (method === "count" && !config.debugLogs.count) {
						return;
					}
				}
				logger.info(`[${config.adapterName}]`, ...args);
				return;
			}

			logger.info(`[${config.adapterName}]`, ...args);
		}
	};
};
