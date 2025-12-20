#!/usr/bin/env node

import { Command } from "commander";
import { init } from "./commands/init";
import { getPackageJson } from "./utils/get-package-json";
import { generateSecret } from "./commands/secret";

const program = new Command("auth");

const packageInfo = await getPackageJson(import.meta.dirname);

export const cliVersion = packageInfo.data?.version || "1.1.2";
program.version(cliVersion);
program.description("Better Auth CLI");

program.addCommand(init);
program.addCommand(generateSecret);

program.parse();

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
