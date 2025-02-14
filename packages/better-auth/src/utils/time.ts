type TimeFormat = "ms" | "s" | "m" | "h" | "d" | "w" | "y";
type Time = `${number}${TimeFormat}`;

interface TimeObject {
	t: Time;
	value: number;
	tFormat: TimeFormat;
	toMilliseconds: () => number;
	toSeconds: () => number;
	toMinutes: () => number;
	toHours: () => number;
	toDays: () => number;
	toWeeks: () => number;
	toYears: () => number;
	getDate: () => Date;
	add: (other: Time | TimeObject) => TimeObject;
	subtract: (other: Time | TimeObject) => TimeObject;
	multiply: (factor: number) => TimeObject;
	divide: (divisor: number) => TimeObject;
	equals: (other: Time | TimeObject) => boolean;
	lessThan: (other: Time | TimeObject) => boolean;
	greaterThan: (other: Time | TimeObject) => boolean;
	format: (pattern: string) => string;
	fromNow: () => string;
	ago: () => string;
}

export const createTime = (value: number, format: TimeFormat): TimeObject => {
	const toMilliseconds = (): number => {
		switch (format) {
			case "ms":
				return value;
			case "s":
				return value * 1000;
			case "m":
				return value * 1000 * 60;
			case "h":
				return value * 1000 * 60 * 60;
			case "d":
				return value * 1000 * 60 * 60 * 24;
			case "w":
				return value * 1000 * 60 * 60 * 24 * 7;
			case "y":
				return value * 1000 * 60 * 60 * 24 * 365;
		}
	};

	const time: TimeObject = {
		t: `${value}${format}` as Time,
		value,
		tFormat: format,
		toMilliseconds,
		toSeconds: () => time.toMilliseconds() / 1000,
		toMinutes: () => time.toSeconds() / 60,
		toHours: () => time.toMinutes() / 60,
		toDays: () => time.toHours() / 24,
		toWeeks: () => time.toDays() / 7,
		toYears: () => time.toDays() / 365,
		getDate: () => new Date(Date.now() + time.toMilliseconds()),
		add: (other: Time | TimeObject) => {
			const otherMs =
				typeof other === "string"
					? parseTime(other).toMilliseconds()
					: other.toMilliseconds();
			return createTime(time.toMilliseconds() + otherMs, "ms");
		},
		subtract: (other: Time | TimeObject) => {
			const otherMs =
				typeof other === "string"
					? parseTime(other).toMilliseconds()
					: other.toMilliseconds();
			return createTime(time.toMilliseconds() - otherMs, "ms");
		},
		multiply: (factor: number) =>
			createTime(time.toMilliseconds() * factor, "ms"),
		divide: (divisor: number) =>
			createTime(time.toMilliseconds() / divisor, "ms"),
		equals: (other: Time | TimeObject) => {
			const otherMs =
				typeof other === "string"
					? parseTime(other).toMilliseconds()
					: other.toMilliseconds();
			return time.toMilliseconds() === otherMs;
		},
		lessThan: (other: Time | TimeObject) => {
			const otherMs =
				typeof other === "string"
					? parseTime(other).toMilliseconds()
					: other.toMilliseconds();
			return time.toMilliseconds() < otherMs;
		},
		greaterThan: (other: Time | TimeObject) => {
			const otherMs =
				typeof other === "string"
					? parseTime(other).toMilliseconds()
					: other.toMilliseconds();
			return time.toMilliseconds() > otherMs;
		},
		format: (pattern: string) => {
			const date = time.getDate();
			return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (match) => {
				switch (match) {
					case "YYYY":
						return date.getFullYear().toString();
					case "MM":
						return (date.getMonth() + 1).toString().padStart(2, "0");
					case "DD":
						return date.getDate().toString().padStart(2, "0");
					case "HH":
						return date.getHours().toString().padStart(2, "0");
					case "mm":
						return date.getMinutes().toString().padStart(2, "0");
					case "ss":
						return date.getSeconds().toString().padStart(2, "0");
					default:
						return match;
				}
			});
		},
		fromNow: () => {
			const ms = time.toMilliseconds();
			if (ms < 0) return time.ago();
			if (ms < 1000) return "in a few seconds";
			if (ms < 60000) return `in ${Math.round(ms / 1000)} seconds`;
			if (ms < 3600000) return `in ${Math.round(ms / 60000)} minutes`;
			if (ms < 86400000) return `in ${Math.round(ms / 3600000)} hours`;
			if (ms < 604800000) return `in ${Math.round(ms / 86400000)} days`;
			if (ms < 2629800000) return `in ${Math.round(ms / 604800000)} weeks`;
			if (ms < 31557600000) return `in ${Math.round(ms / 2629800000)} months`;
			return `in ${Math.round(ms / 31557600000)} years`;
		},
		ago: () => {
			const ms = -time.toMilliseconds();
			if (ms < 0) return time.fromNow();
			if (ms < 1000) return "a few seconds ago";
			if (ms < 60000) return `${Math.round(ms / 1000)} seconds ago`;
			if (ms < 3600000) return `${Math.round(ms / 60000)} minutes ago`;
			if (ms < 86400000) return `${Math.round(ms / 3600000)} hours ago`;
			if (ms < 604800000) return `${Math.round(ms / 86400000)} days ago`;
			if (ms < 2629800000) return `${Math.round(ms / 604800000)} weeks ago`;
			if (ms < 31557600000) return `${Math.round(ms / 2629800000)} months ago`;
			return `${Math.round(ms / 31557600000)} years ago`;
		},
	};

	return time;
};

export const parseTime = (time: Time): TimeObject => {
	const match = time.match(/^(\d+)(ms|s|m|h|d|w|y)$/);
	if (!match) throw new Error("Invalid time format");
	return createTime(parseInt(match[1]), match[2] as TimeFormat);
};
