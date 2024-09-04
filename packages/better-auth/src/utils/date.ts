export const getDate = (span: number, isSeconds = false) => {
	const date = new Date();
	return new Date(date.getTime() + (isSeconds ? span * 1000 : span));
};
