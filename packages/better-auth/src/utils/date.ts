export const getDate = (span: number, unit: "sec" | "ms" = "ms") => {
	const date = new Date();
	return new Date(date.getTime() + (unit === "sec" ? span * 1000 : span));
};
