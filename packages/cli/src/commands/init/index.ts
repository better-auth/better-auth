import path from "node:path";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	multiselect,
	select,
	text,
} from "@clack/prompts";
import { Command } from "commander";
import z from "zod";
import { generateAuthConfigCode } from "./generate-auth";

// Goals:
// 1. init `auth.ts` file
// 2. init `auth-client.ts` file
// 3. init or update `env` files
// 4. init endpoints file (e.g. `route.ts`)
// 5. install dependencies

const processCancelAction = <T extends any | symbol>(val: T) => {
	if (isCancel(val)) {
		cancel("✋ Operation cancelled.");
		process.exit(0);
	}
	return val as T extends symbol ? never : T;
};

export async function initAction(opts: any) {
	const options = z
		.object({
			cwd: z.string().transform((val) => path.resolve(val)),
			config: z.string().optional(),
		})
		.parse(opts);

	intro("👋 Better Auth CLI");

	const authConfigCode = await generateAuthConfigCode({
		plugins: ["username", "twoFactor"],
		database: "kysely-mssql",
		appName: "My App",
		baseURL: "https://my-app.com",
		getArguments: async ({
			flag,
			isConformation,
			isMultiselectOptions,
			isSelectOptions,
			question,
			isRequired,
			isNumber,
			skipPrompt,
		}) => {
			const flagVariable = flag.replace(/-([a-z])/g, (_, letter) =>
				letter.toUpperCase(),
			);

			if (options[flagVariable as keyof typeof options]) {
				return options[flagVariable as keyof typeof options];
			}

			if (skipPrompt) return;

			if (isMultiselectOptions) {
				let result = await multiselect({
					message: question,
					options: isMultiselectOptions,
					required: isRequired ?? false,
				});
				result = processCancelAction(result);
				return result.join(", ");
			}

			if (isSelectOptions) {
				let result = await select({
					message: question,
					options: isSelectOptions,
				});
				result = processCancelAction(result);
				return result;
			}

			if (isConformation) {
				let result = await confirm({
					message: question,
				});
				result = processCancelAction(result);
				return result;
			}

			if (isNumber) {
				let result = await text({
					message: question,
					validate(value) {
						if (isNaN(Number(value))) {
							return "This field must be a number";
						}
						if (isRequired && (!value || !value.trim())) {
							return "This field is required";
						}
					},
				});
				result = processCancelAction(result);
				return Number(result);
			}

			let result = await text({
				message: question,
				validate(value) {
					if (isRequired && (!value || !value.trim())) {
						return "This field is required";
					}
				},
			});
			result = processCancelAction(result);
			return result;
		},
	});
	console.log(authConfigCode);
}

export const init = new Command("init")
	.option("-c, --cwd <cwd>", "The working directory.", process.cwd())
	.option(
		"--config <config>",
		"The path to the auth configuration file. defaults to the first `auth.ts` file found.",
	)
	.action(initAction);
