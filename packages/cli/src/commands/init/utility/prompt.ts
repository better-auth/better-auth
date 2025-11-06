import {
	cancel,
	confirm,
	isCancel,
	multiselect,
	select,
	text,
} from "@clack/prompts";
import type { InitActionOptions } from "..";
import type { GetArgumentsFn } from "../generate-auth";

const processCancelAction = <T extends any | symbol>(val: T) => {
	if (isCancel(val)) {
		cancel("✋ Operation cancelled.");
		process.exit(0);
	}
	return val as T extends symbol ? never : T;
};

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
	}) => {
		const flagVariable = getFlagVariable(flag);

		if (options[flagVariable as keyof typeof options]) {
			return options[flagVariable as keyof typeof options];
		}

		// console.log({
		// 	flag,
		// 	skipPrompt,
		// 	isRequired,
		// 	defaultValue,
		// 	isMultiselectOptions,
		// 	isSelectOptions,
		// 	question,
		// 	isConformation,
		// 	isNumber,
		// });
		
		if (skipPrompt) {
			if (isRequired && defaultValue) {
				return defaultValue;
			}
			return;
		}

		if (isMultiselectOptions) {
			let result = await multiselect({
				message: question ?? description,
				options: isMultiselectOptions,
				required: isRequired ?? false,
			});
			result = processCancelAction(result);
			return result.join(", ");
		}

		if (isSelectOptions) {
			let result = await select({
				message: question ?? description,
				options: isSelectOptions,
			});
			result = processCancelAction(result);
			return result;
		}

		if (isConformation) {
			let result = await confirm({
				message: question ?? description,
				initialValue: defaultValue,
			});
			result = processCancelAction(result);
			return result;
		}

		if (isNumber) {
			let result = await text({
				message: question ?? description,
				validate(value) {
					if (isNaN(Number(value))) {
						return "This field must be a number";
					}
					if (isRequired && (!value || !value.trim())) {
						return "This field is required";
					}
				},
				defaultValue,
				placeholder: defaultValue ? String(defaultValue) : undefined,
			});
			result = processCancelAction(result);
			return Number(result);
		}

		let result = await text({
			message: question ?? description,
			validate(value) {
				if (isRequired && (!value || !value.trim())) {
					return "This field is required";
				}
			},
			defaultValue,
			placeholder: defaultValue ? String(defaultValue) : undefined,
		});
		result = processCancelAction(result);
		return result;
	};
