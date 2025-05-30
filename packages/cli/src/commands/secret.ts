import { logger } from "better-auth";
import chalk from "chalk";
import { Command } from "commander";
import Crypto from "crypto";

export const generateSecret = new Command("secret").action(() => {
	const secret = generateSecretHash();
	logger.info(`\nAdd the following to your .env file: 
${
	chalk.gray("# Auth Secret") + chalk.green(`\nBETTER_AUTH_SECRET=${secret}`)
}`);
});

export const generateSecretHash = () => {
	return Crypto.randomBytes(32).toString("hex");
};
