import { existsSync } from "node:fs";
import path from "node:path";
import { APIError } from "@better-auth/core/error";
import { betterAuth } from "better-auth";
import chalk from "chalk";
import { Command } from "commander";
import prompts from "prompts";
import * as z from "zod";
import { getConfig } from "../utils/get-config";

type CreateUserApi = (input: {
	body: {
		email: string;
		password: string;
		name: string;
		role: string;
		data?: Record<string, unknown> | undefined;
	};
}) => Promise<{
	user?: {
		id?: string | number | undefined;
		email?: string | undefined;
		role?: string | undefined;
	};
}>;

function exitWithError(message: string): never {
	console.error(chalk.red(`Error: ${message}`));
	process.exit(1);
	throw new Error(message);
}

function parseData(data: string | undefined) {
	if (!data) return undefined;
	try {
		const parsed = JSON.parse(data);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			exitWithError("--data must be a JSON object.");
		}
		return parsed as Record<string, unknown>;
	} catch (error) {
		if (error instanceof SyntaxError) {
			exitWithError("--data must be valid JSON.");
		}
		throw error;
	}
}

async function resolveRequiredInput(options: {
	email?: string | undefined;
	password?: string | undefined;
	name?: string | undefined;
}) {
	let { email, password, name } = options;

	if (!email) {
		const response = await prompts({
			type: "text",
			name: "email",
			message: "Admin email",
		});
		email = response.email;
	}

	if (!password) {
		const response = await prompts({
			type: "password",
			name: "password",
			message: "Admin password",
		});
		password = response.password;
	}

	if (!name) {
		const response = await prompts({
			type: "text",
			name: "name",
			message: "Admin name",
			initial: "Admin",
		});
		name = response.name;
	}

	if (!email) exitWithError("Admin email is required.");
	if (!password) exitWithError("Admin password is required.");
	if (!name) exitWithError("Admin name is required.");

	return {
		email,
		password,
		name,
	};
}

/** @internal */
export async function createAdminAction(opts: unknown) {
	const options = z
		.object({
			cwd: z.string(),
			config: z.string().optional(),
			email: z.string().optional(),
			password: z.string().optional(),
			name: z.string().optional(),
			role: z.string().default("admin"),
			data: z.string().optional(),
			emailVerified: z.boolean().default(true),
			force: z.boolean().optional(),
			y: z.boolean().optional(),
			yes: z.boolean().optional(),
		})
		.parse(opts);

	const cwd = path.resolve(options.cwd);
	if (!existsSync(cwd)) {
		exitWithError(`The directory "${cwd}" does not exist.`);
	}

	if (options.y) {
		console.warn("WARNING: --y is deprecated. Consider -y or --yes");
		options.yes = true;
	}

	const config = await getConfig({
		cwd,
		configPath: options.config,
	});
	if (!config) {
		exitWithError(
			"No configuration file found. Add an `auth.ts` file to your project or pass the path to the configuration file using the `--config` flag.",
		);
	}

	if (!config.database) {
		exitWithError(
			"No database is configured. Add a persistent database before creating an admin user.",
		);
	}

	const auth = betterAuth(config);
	const createUser = (auth.api as Record<string, unknown>).createUser as
		| CreateUserApi
		| undefined;

	if (typeof createUser !== "function") {
		exitWithError(
			"The admin plugin is required. Add `admin()` to your Better Auth plugins before running this command.",
		);
	}

	const { email, password, name } = await resolveRequiredInput(options);
	const emailResult = z.email().safeParse(email);
	if (!emailResult.success) {
		exitWithError("Invalid email address.");
	}
	const data = {
		...parseData(options.data),
		emailVerified: options.emailVerified,
	};

	const context = await auth.$context;
	const totalUsers = await context.internalAdapter.countTotalUsers();
	if (totalUsers > 0 && !options.force && !options.yes) {
		const response = await prompts({
			type: "confirm",
			name: "confirmed",
			message: `Found ${totalUsers} existing user${
				totalUsers === 1 ? "" : "s"
			}. Create an admin user anyway?`,
			initial: false,
		});
		if (!response.confirmed) {
			console.log("Create admin cancelled.");
			process.exit(0);
			return;
		}
	}

	try {
		const result = await createUser({
			body: {
				email,
				password,
				name,
				role: options.role,
				data,
			},
		});
		console.log(chalk.green("Admin user created successfully."));
		if (result.user?.id) {
			console.log(`User ID: ${result.user.id}`);
		}
		console.log(`Email: ${result.user?.email ?? email.toLowerCase()}`);
		console.log(`Role: ${result.user?.role ?? options.role}`);
		process.exit(0);
	} catch (error) {
		if (error instanceof APIError) {
			exitWithError(error.message);
		}
		if (error instanceof Error) {
			exitWithError(error.message);
		}
		exitWithError("Failed to create admin user.");
	}
}

export const createAdmin = new Command("create-admin")
	.description("Create an initial admin user")
	.option(
		"-c, --cwd <cwd>",
		"the working directory. defaults to the current directory.",
		process.cwd(),
	)
	.option(
		"--config <config>",
		"the path to the configuration file. defaults to the first configuration file found.",
	)
	.option("--email <email>", "the email address for the admin user")
	.option("--password <password>", "the password for the admin user")
	.option("--name <name>", "the name for the admin user", "Admin")
	.option("--role <role>", "the role to assign to the user", "admin")
	.option("--data <json>", "additional user fields as a JSON object")
	.option(
		"--no-email-verified",
		"create the admin user with an unverified email",
	)
	.option(
		"--force",
		"create an admin user even when users already exist",
		false,
	)
	.option(
		"-y, --yes",
		"automatically confirm creating an admin when users already exist",
		false,
	)
	.option("--y", "(deprecated) same as --yes", false)
	.action(createAdminAction);
