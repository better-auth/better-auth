import Crypto from "node:crypto";
import chalk from "chalk";
import { Command } from "commander";

export const generateSecret = new Command("secret").action(() => {
	const secret = Crypto.randomBytes(32).toString("hex");
	console.error(chalk.gray("Add the following to your .env file:"));
	// Scripts parse this exact line from stdout, so it stays alone and unstyled.
	console.log(`BETTER_AUTH_SECRET=${secret}`);
});
