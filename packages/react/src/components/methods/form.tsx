import { generateForm, type FormOptions } from "@better-auth/components";
import { useReducer } from "react";
import { hastToReact } from "../../lib/utils";
import { createElement } from "react";
import { defaultValues } from "../../constants";

export default function Form(options: FormOptions & { disabled?: boolean }) {
	const [data, setData] = useReducer(
		(prev, [key, arg]: [string, any]) => ({ ...prev, [key]: arg }),
		options.fields.reduce(
			(prev, arg) => {
				console.log(prev, arg);
				return {
					...prev,
					[arg.id]: arg?.defaultValue ?? defaultValues[arg.field] ?? undefined,
				};
			},
			{} as Record<string, any>,
		),
	);

	console.log("REDUCED DATA", data);

	const hast = generateForm(options);
	console.log("HAST", hast);
	return createElement("div", {}, [
		hastToReact(hast, [data, setData], Boolean(options.disabled)),
	]);
}
