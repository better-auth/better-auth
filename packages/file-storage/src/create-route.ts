import type { FileRoute } from "./types";

export const createRoute = <
	Metadata extends Record<string, any> | false = false,
>(
	options: FileRoute<Metadata>,
) => {
	return options;
};
