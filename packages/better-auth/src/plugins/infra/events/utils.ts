import { logger } from "better-auth";

type Task<T> = () => Promise<T> | T;
export function backgroundTask<T>(task: Task<T>) {
	let result;

	// Deal with synchronous failures

	try {
		result = task();
	} catch (error) {
		logger.debug("Error performing background operation: ", error);
		return;
	}

	// Deal with async failures

	Promise.resolve(result).catch((error) => {
		logger.debug("Error performing background operation: ", error);
	});
}
