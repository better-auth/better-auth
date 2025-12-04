import Crypto from "node:crypto";
import chalk from "chalk";
import { Command } from "commander";

export const generateSecret = new Command("secret").action(() => {
	const secret = generateSecretHash();
	console.log(`\nAdd the following to your .env file: 
${
	chalk.gray("# Auth Secret") + chalk.green(`\nBETTER_AUTH_SECRET=${secret}`)
}`);
});

export const generateSecretHash = () => {
	return Crypto.randomBytes(32).toString("hex");
};
