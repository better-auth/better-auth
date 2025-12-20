import prompts from "prompts";
import type { InitActionOptions } from "..";
import type { GetArgumentsFn } from "../generate-auth";

export const getFlagVariable = (flag: string) => {
	return flag.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

export const getArgumentsPrompt: (
	options: InitActionOptions,
) => GetArgumentsFn =
	(options) =>
	async ({
		flag,
		isConformation,
		isMultiselectOptions,
		isSelectOptions,
		question,
		isRequired,
		isNumber,
		skipPrompt,
		defaultValue,
		description,
		cliTransform,
		argument,
	}) => {
		const flagVariable = getFlagVariable(flag);

		if (options[flagVariable as keyof typeof options]) {
			let value = options[flagVariable as keyof typeof options];
			// Apply cliTransform if provided
			if (cliTransform) {
				value = cliTransform(value);
			}
			return value;
		}

		if (skipPrompt) {
			if (isRequired && defaultValue) {
				return defaultValue;
			}
			return;
		}

		if (isMultiselectOptions) {
			const response = await prompts({
				type: "multiselect",
				name: "value",
				message: question ?? description,
				choices: isMultiselectOptions.map((opt) => ({
					title: opt.label ?? String(opt.value),
					value: opt.value,
					description: opt.hint,
				})),
			});
			if (!response) {
				console.log("✋ Operation cancelled.");
				process.exit(0);
			}
			const result = response.value;
			return Array.isArray(result) ? result.join(", ") : result;
		}

		if (isSelectOptions) {
			const response = await prompts({
				type: "select",
				name: "value",
				message: question ?? description,
				choices: isSelectOptions.map((opt) => ({
					title: opt.label ?? String(opt.value),
					value: opt.value,
					description: opt.hint,
				})),
			});
			if (!response) {
				console.log("✋ Operation cancelled.");
				process.exit(0);
			}
			return response.value;
		}

		if (isConformation) {
			const response = await prompts({
				type: "confirm",
				name: "value",
				message: question ?? description,
				initial: defaultValue ?? true,
			});
			if (!response) {
				console.log("✋ Operation cancelled.");
				process.exit(0);
			}
			return response.value;
		}

		if (isNumber) {
			const response = await prompts({
				type: "number",
				name: "value",
				message: question ?? description,
				initial: defaultValue,
				validate: (value) => {
					if (isNaN(Number(value))) {
						return "This field must be a number";
					}
					if (isRequired && (value === undefined || value === null)) {
						return "This field is required";
					}
					return true;
				},
			});
			if (!response) {
				console.log("✋ Operation cancelled.");
				process.exit(0);
			}
			return Number(response.value);
		}

		const response = await prompts({
			type: "text",
			name: "value",
			message: question ?? description,
			initial: defaultValue,
			validate: (value) => {
				if (isRequired && (!value || !value.trim())) {
					return "This field is required";
				}
				// Apply cliTransform before schema validation
				let transformedValue = value;
				if (cliTransform) {
					transformedValue = cliTransform(value);
				}
				if (argument.schema) {
					const schema = argument.schema.safeParse(transformedValue);
					if (!schema.success) {
						return schema.error.message;
					}
				}
				return true;
			},
		});
		if (!response) {
			console.log("✋ Operation cancelled.");
			process.exit(0);
		}
		let result = response.value;
		// Apply cliTransform to the result before returning
		if (cliTransform) {
			result = cliTransform(result);
		}
		return result;
	};
