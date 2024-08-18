export const getDate = (span: number) => {
	const date = new Date();
	return new Date(date.getTime() + span);
};
