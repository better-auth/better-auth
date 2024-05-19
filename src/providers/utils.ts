import type { Context } from "../routes/types";
import type { Provider } from "./types";

export const getProvider = (
	context: Context,
	providerId: string,
): Provider | undefined => {
	const providers = context.providers;
	const provider = providers.find((provider) => provider.id === providerId);
	return provider;
};
