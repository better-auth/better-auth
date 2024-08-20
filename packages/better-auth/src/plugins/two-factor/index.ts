import { Plugin } from "../../types/plugins";

export const multiFactor = () => {
	return {
		id: "multi-factor",
		endpoints: {},
	} satisfies Plugin;
};
