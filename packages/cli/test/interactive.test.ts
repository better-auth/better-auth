import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { requireInteractive } from "../src/utils/interactive";
import { prompt } from "../src/utils/prompt";

type Streams = Record<"stdin" | "stdout" | "stderr", boolean>;

const migrations = {
	action: "run these migrations",
	input: "--yes",
};

function setTerminal(streams: Streams) {
	for (const [name, isTTY] of Object.entries(streams)) {
		const stream = process[name as keyof Streams];
		const original = Object.getOwnPropertyDescriptor(stream, "isTTY");
		Object.defineProperty(stream, "isTTY", {
			value: isTTY,
			configurable: true,
		});
		onTestFinished(() => {
			if (original) Object.defineProperty(stream, "isTTY", original);
			else Reflect.deleteProperty(stream, "isTTY");
		});
	}
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("interaction modes", () => {
	it.each([
		["an interactive terminal", { stdin: true, stdout: true, stderr: true }],
		["stdout redirected", { stdin: true, stdout: false, stderr: true }],
	])("prompts in %s", (_, streams) => {
		vi.stubEnv("CI", "");
		setTerminal(streams);
		const exit = vi.spyOn(process, "exit");

		requireInteractive(migrations);

		expect(exit).not.toHaveBeenCalled();
	});

	it.each([
		["stdin piped", { stdin: false, stdout: true, stderr: true }, ""],
		["stderr redirected", { stdin: true, stdout: true, stderr: false }, ""],
		["CI with a terminal", { stdin: true, stdout: true, stderr: true }, "1"],
	])("exits 2 with %s", (_, streams, ci) => {
		vi.stubEnv("CI", ci);
		setTerminal(streams);
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(process, "exit").mockImplementation((code) => {
			throw new Error(`process.exit(${code})`);
		});

		expect(() => requireInteractive(migrations)).toThrow("process.exit(2)");
		expect(error).toHaveBeenCalledWith(
			"Can't run these migrations without --yes in non-interactive mode.",
		);
	});

	it("asks on stderr so a redirected stdout keeps only the result", async () => {
		vi.stubEnv("CI", "");
		setTerminal({ stdin: true, stdout: false, stderr: true });
		const stderr = vi
			.spyOn(process.stderr, "write")
			.mockImplementation(() => true);
		const stdout = vi
			.spyOn(process.stdout, "write")
			.mockImplementation(() => true);
		const stdin = new PassThrough();

		const answer = prompt(
			{
				type: "confirm",
				name: "confirmed",
				message: "Run these migrations?",
				stdin,
			},
			migrations,
		);
		stdin.write("y");

		expect(await answer).toEqual({ confirmed: true });
		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining("Run these migrations?"),
		);
		expect(stdout).not.toHaveBeenCalled();
	});
});
