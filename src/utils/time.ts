type TimeSpan<
	T extends number = number,
	P extends string = "w" | "d" | "hr" | "m" | "s",
> = `${T}${P}`;

export const timeSpan = (span: TimeSpan) => {
	const [time, unit] = span;
	const timeInMs = Number.parseInt(time as string) * 1000;
	switch (unit) {
		case "s":
			return timeInMs;
		case "m":
			return timeInMs * 60;
		case "hr":
			return timeInMs * 60 * 60;
		case "d":
			return timeInMs * 60 * 60 * 24;
		case "w":
			return timeInMs * 60 * 60 * 24 * 7;
		default:
			return 0;
	}
};

export const getDate = (span: TimeSpan | number) => {
	const sec = typeof span === "number" ? span : timeSpan(span);
	const date = new Date();
	return new Date(date.getTime() + sec);
};
