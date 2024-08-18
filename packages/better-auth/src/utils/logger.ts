import { createConsola } from "consola";

const consola = createConsola({
	formatOptions: {
		date: false
	}
});

export const createLogger = (options?: {
	disabled?: boolean;
}) => {
	return {
		log: (...args: any[]) => {
			!options?.disabled && consola.log("", ...args);
		},
		error: (...args: any[]) => {
			!options?.disabled && consola.error("", ...args);
		},
		warn: (...args: any[]) => {
			!options?.disabled && consola.warn("", ...args);
		},
		info: (...args: any[]) => {
			!options?.disabled && consola.info("", ...args);
		},
		debug: (...args: any[]) => {
			!options?.disabled && consola.debug("", ...args);
		},
		box: (...args: any[]) => {
			!options?.disabled && consola.box("", ...args);
		},
		success: (...args: any[]) => {
			!options?.disabled && consola.success("", ...args);
		},
		break: (...args: any[]) => {
			!options?.disabled && console.log("\n");
		},
	};
};

export const logger = createLogger();
