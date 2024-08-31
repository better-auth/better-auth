import { Command } from "commander";
import "dotenv/config";
import { migrate } from "./commands/migrate";
import { exportTypes } from "./commands/export-type";

async function main() {
	const program = new Command().name("better-auth");
	program.addCommand(migrate).addCommand(exportTypes);
	program.parse();
}

main();
