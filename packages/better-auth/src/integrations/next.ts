import { headers } from "next/headers";
import type { NextApiRequest } from "next/types";
import type { BetterAuth, BetterAuthHandler } from "..";

export const toNextJSHandler = (handler: BetterAuthHandler) => {
	const fn = async (request: NextApiRequest) => {
		return handler(request);
	};
	return {
		POST: fn,
		GET: fn,
	};
};

/**
 * Get the server actions for the better auth instance.
 */
export function getServerActions<B extends BetterAuth>(auth: B) {
	return {
		...(Object.keys(auth.caller).map((key) => ({
			[key]: (input: any) => {
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				const res = auth.caller[key as "signIn"]!(headers(), input);
				return res;
			},
		})) as unknown as B["caller"] extends {
			[key in infer K]: infer V;
		}
			? {
					[key in K]: B["caller"][key] extends (
						request: any,
						input: infer Input,
					) => infer R
						? unknown extends Input
							? () => R
							: (input: Input) => R
						: never;
				}
			: never),
	};
}
