import { format as prettierFormat } from "prettier";

export const formatCode = async (code: string) => {
	return await prettierFormat(code, {
		parser: "typescript",
	});
};
