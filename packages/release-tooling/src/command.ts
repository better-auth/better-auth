export async function runCommand(
	command: () => void | Promise<void>,
): Promise<void> {
	try {
		await command();
	} catch (error) {
		console.error(
			error instanceof Error ? (error.stack ?? error.message) : String(error),
		);
		process.exitCode = 1;
	}
}
