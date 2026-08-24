import prompts from "prompts";
import type { PluginConfig } from "../configs/temp-plugins.config";
import type { GetArgumentsFn, GetArgumentsOptions } from "../generate-auth";

export const getFlagVariable = (flag: string) => {
	return flag.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

const collectPromptableArgs = (
	args: GetArgumentsOptions[] | undefined,
	options: Record<string, unknown>,
): GetArgumentsOptions[] => {
	if (!args) return [];
	const result: GetArgumentsOptions[] = [];
	for (const arg of args) {
		if (arg.isNestedObject && Array.isArray(arg.isNestedObject)) {
			result.push(...collectPromptableArgs(arg.isNestedObject, options));
		} else {
			const flagVar = getFlagVariable(arg.flag);
			const hasFlag = options[flagVar] !== undefined && options[flagVar] !== "";
			if (arg.skip === "always" || arg.skip === "prompt") continue;
			if (arg.skip === "flag") {
				result.push(arg);
			} else {
				if (!hasFlag) result.push(arg);
			}
		}
	}
	return result;
};

const toPromptQuestion = (arg: GetArgumentsOptions) => {
	const name = getFlagVariable(arg.flag);
	const message = arg.question ?? arg.description ?? "";
	const base = { name, message, initial: arg.defaultValue };

	if (arg.isMultiselectOptions) {
		return {
			...base,
			type: "multiselect" as const,
			choices: arg.isMultiselectOptions.map((opt) => ({
				title: opt.label ?? String(opt.value),
				value: opt.value,
				description: opt.hint,
			})),
			format: (v: unknown) => (Array.isArray(v) ? v.join(", ") : v),
		};
	}
	if (arg.isSelectOptions) {
		return {
			...base,
			type: "select" as const,
			choices: arg.isSelectOptions.map((opt) => ({
				title: opt.label ?? String(opt.value),
				value: opt.value,
				description: opt.hint,
			})),
		};
	}
	if (arg.isConfirmation) {
		return { ...base, type: "confirm" as const };
	}
	if (arg.isNumber) {
		return {
			...base,
			type: "number" as const,
			validate: (v: number) =>
				arg.isRequired && (v == null || Number.isNaN(v))
					? "This field is required"
					: true,
		};
	}
	return {
		...base,
		type: "text" as const,
		validate: (v: string) => {
			if (arg.isRequired && (!v || !v.trim())) return "This field is required";
			if (arg.argument.schema) {
				const parsed = arg.argument.schema.safeParse(
					arg.cliTransform ? arg.cliTransform(v) : v,
				);
				return parsed.success ? true : parsed.error.message;
			}
			return true;
		},
	};
};

export const getArgumentsPrompt = async (
	options: Record<string, unknown>,
	plugins: PluginConfig[],
	target: "auth" | "authClient",
): Promise<GetArgumentsFn> => {
	const opts = options;
	const allPromptableArgs: GetArgumentsOptions[] = [];
	for (const plugin of plugins) {
		if (target === "auth" && plugin.auth.arguments) {
			allPromptableArgs.push(
				...collectPromptableArgs(plugin.auth.arguments, opts),
			);
		} else if (
			target === "authClient" &&
			plugin.authClient &&
			plugin.authClient.arguments
		) {
			allPromptableArgs.push(
				...collectPromptableArgs(plugin.authClient.arguments, opts),
			);
		}
	}

	let batchAnswers: Record<string, unknown> = {};
	if (allPromptableArgs.length > 0) {
		const questions = allPromptableArgs.map(toPromptQuestion);
		const res = await prompts(questions, {
			onCancel: () => {
				console.log("✋ Operation cancelled.");
				process.exit(0);
			},
		});
		batchAnswers = (res ?? {}) as Record<string, unknown>;
	}

	return (arg: GetArgumentsOptions) => {
		const flagVar = getFlagVariable(arg.flag);
		const hasFlag = opts[flagVar] !== undefined && opts[flagVar] !== "";

		if (arg.skip === "always") {
			return arg.isRequired && arg.defaultValue !== undefined
				? arg.defaultValue
				: undefined;
		}
		if (arg.skip === "prompt") {
			if (hasFlag) {
				const val = opts[flagVar];
				return arg.cliTransform ? arg.cliTransform(val) : val;
			}
			return arg.isRequired && arg.defaultValue !== undefined
				? arg.defaultValue
				: undefined;
		}
		if (arg.skip === "flag") {
			if (batchAnswers[flagVar] !== undefined) {
				let val = batchAnswers[flagVar];
				if (arg.cliTransform) val = arg.cliTransform(val);
				return val;
			}
			return arg.isRequired && arg.defaultValue !== undefined
				? arg.defaultValue
				: undefined;
		}
		if (hasFlag) {
			const val = opts[flagVar];
			return arg.cliTransform ? arg.cliTransform(val) : val;
		}
		if (batchAnswers[flagVar] !== undefined) {
			let val = batchAnswers[flagVar];
			if (arg.cliTransform) val = arg.cliTransform(val);
			return val;
		}
		return arg.isRequired && arg.defaultValue !== undefined
			? arg.defaultValue
			: undefined;
	};
};
