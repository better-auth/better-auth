import { Command } from "commander";

export const telemetry = new Command("telemetry");

telemetry
	.command("enable")
	.description("Enable telemetry")
	.action(() => {
		console.log("Telemetry enabled");
	});

telemetry
	.command("disable")
	.description("Disable telemetry")
	.action(() => {
		console.log("Telemetry disabled");
	});
