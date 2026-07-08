import { BetterAuthError } from "../../error";
import type { BetterAuthDBSchema } from "../type";

export const initGetDefaultModelName = ({
	usePlural,
	schema,
}: {
	usePlural: boolean | undefined;
	schema: BetterAuthDBSchema;
}) => {
	/**
	 * This function helps us get the default model name from the schema defined by devs.
	 * Often times, the user will be using the `modelName` which could had been customized by the users.
	 * This function helps us get the actual model name useful to match against the schema. (eg: schema[model])
	 *
	 * If it's still unclear what this does:
	 *
	 * 1. User can define a custom modelName.
	 * 2. When using a custom modelName, doing something like `schema[model]` will not work.
	 * 3. Using this function helps us get the actual model name based on the user's defined custom modelName.
	 */
	const getDefaultModelName = (model: string) => {
		// Resolve a model string (either a schema key or a user-defined
		// `modelName`) back to its canonical schema key.
		//
		// Prefer a `modelName` match over a schema-key match. When a user
		// remaps a built-in table (e.g. `user.modelName = "account"`), the
		// string `"account"` is both an alias for the user table and the
		// schema key of the OAuth account table. The user's explicit
		// `modelName` choice must win, otherwise references and adapter
		// joins silently resolve to the wrong table.
		// @see https://github.com/better-auth/better-auth/issues/8111
		const resolve = (candidate: string): string | undefined => {
			const byModelName = Object.entries(schema).find(
				([_, f]) => f.modelName === candidate,
			)?.[0];
			if (byModelName) return byModelName;
			return schema[candidate] ? candidate : undefined;
		};

		// It's possible this `model` could had applied `usePlural`.
		// Thus we'll try the search but without the trailing `s`.
		if (usePlural && model.charAt(model.length - 1) === "s") {
			const pluralessModel = model.slice(0, -1);
			const m = resolve(pluralessModel);
			if (m) return m;
		}

		const m = resolve(model);

		if (!m) {
			throw new BetterAuthError(`Model "${model}" not found in schema`);
		}
		return m;
	};

	return getDefaultModelName;
};
