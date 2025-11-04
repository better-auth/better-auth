import { format as prettierFormat } from "prettier";

export * from "./imports";
export * from "./auth-config";
export * from "./database";

export const formatCode = async (code: string) => {
	return await prettierFormat(code, {
		parser: "typescript",
	});
};
