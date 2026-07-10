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
		// An exact schema-key match must win over a `modelName` match.
		// Better-auth internals (and `references.model`, see get-tables.ts)
		// always pass canonical schema keys, so when a user remaps a
		// built-in table onto another table's schema key (e.g.
		// `user.modelName = "account"`), preferring the modelName alias
		// would silently reroute every internal "account" query to the
		// user table. The modelName lookup is only a fallback for
		// externally supplied physical table names.
		// @see https://github.com/better-auth/better-auth/issues/8111
		// @see https://github.com/better-auth/better-auth/issues/10136
		const resolve = (candidate: string): string | undefined => {
			if (schema[candidate]) return candidate;
			return Object.entries(schema).find(
				([_, f]) => f.modelName === candidate,
			)?.[0];
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
