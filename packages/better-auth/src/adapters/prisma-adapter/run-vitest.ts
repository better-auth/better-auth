import { spawn } from "child_process";
import { Readable } from "stream";

/**
 * Runs the Vitest command and streams the output to the console.
 *
 * @param args An array of strings representing the arguments to pass to Vitest.
 *             If omitted, the default is to run all tests.
 * @returns A promise that resolves when Vitest finishes and rejects if it exits
 *          with a non-zero code.
 */
export async function runVitest(args: string[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		const vitestProcess = spawn("vitest", args, {
			stdio: ["pipe", "pipe", "pipe"], // Capture stdin, stdout, and stderr
			shell: process.platform === "win32", // Required for Windows
		});

		// Function to handle stream data (stdout or stderr)
		const handleStreamData = (stream: Readable, prefix: string) => {
			stream.on("data", (data: Buffer) => {
				const output = data.toString();
				console.log(output);
				if (output.trim().includes("Tests failed. Watching for file changes")) {
					reject();
				} else if (output.trim().includes("PASS  Waiting for file changes")) {
					resolve();
				}
			});
		};

		// Handle standard output
		handleStreamData(vitestProcess.stdout, "");

		// Handle standard error
		handleStreamData(vitestProcess.stderr, "Error:");

		vitestProcess.on("close", (code) => {
			if (code === 0) {
				console.log("Vitest completed successfully.");
				resolve();
			} else {
				console.error(`Vitest exited with code ${code}`);
				reject(new Error(`Vitest exited with code ${code}`));
			}
		});

		vitestProcess.on("error", (err) => {
			console.error("Failed to start Vitest:", err);
			reject(err);
		});
	});
}
