import { Command } from "commander";
import { GlobalConfig } from "../../../better-auth/src/config";
import { TELEMETRY_CONFIG_KEY } from "../../../better-auth/src/telemetry/config-key";

export const telemetry = new Command("telemetry");

telemetry
	.command("enable")
	.description("Enable telemetry")
	.action(() => {
		const config = new GlobalConfig();
		config.set(TELEMETRY_CONFIG_KEY, "true");
		console.log("Telemetry enabled");
	});

telemetry
	.command("disable")
	.description("Disable telemetry")
	.action(() => {
		const config = new GlobalConfig();
		config.set(TELEMETRY_CONFIG_KEY, "false");
		console.log("Telemetry disabled");
	});
