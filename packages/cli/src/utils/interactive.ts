/**
 * Whether someone at a terminal can answer a prompt and read optional hints.
 */
export function isInteractive() {
	return (
		Boolean(process.stdin.isTTY && process.stderr.isTTY) && !process.env.CI
	);
}

/**
 * Exits before a prompt when the run has no terminal to answer it, naming the
 * input that replaces the answer.
 *
 * A prompt in CI or behind a pipe either waits forever or ends with exit code 0
 * as if it had succeeded. Missing input is a usage error, so it exits with 2.
 */
export function requireInteractive({
	action,
	input,
}: {
	action: string;
	input: string;
}) {
	if (isInteractive()) return;
	console.error(`Can't ${action} without ${input} in non-interactive mode.`);
	process.exit(2);
}
