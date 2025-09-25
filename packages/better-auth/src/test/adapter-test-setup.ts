import { type TestProject } from "vitest/node";
import { createServer } from "http";

const PORT = 7789;

/**
 * This file is used to setup adapter unit tests.
 * Since test database migrations are ran in `beforeAll` hooks, it's possible
 * that vitest will run multiple `beforeAll` hooks along-side each other,
 * thus causing migrations to collide or cause the following tests to clash due to
 * race conditions.
 *
 * Since there is no way to share state across tests,
 * we use a server to store the active tests.
 * This acts as a tracker to avoid race conditions,
 * ensuring each adapter tests that could collide run sequentially.
 *
 * WARNING: Do not change the name or path of this file.
 * If you do, you will need to update the `globalSetup` in `vitest.config.ts`.
 */
export default async function setup(project: TestProject) {
	let activeTests: string[] = [];

	project.onTestsRerun(async () => {
		// on test rerun, we reset the active tests
		activeTests.length = 0;
	});

	const server = createServer((req, res) => {
		if (req.url === "/add-test") {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				const test = body;
				activeTests.push(test);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(activeTests));
			});
		} else if (req.url === "/get-tests") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(activeTests));
		} else if (req.url === "/reset-tests") {
			activeTests.length = 0;
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(activeTests));
		} else if (req.url === "/remove-test") {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				const test = body;
				activeTests = activeTests.filter((t) => t !== test);
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(activeTests));
			});
		}
	});

	server.listen(PORT, () => {
		console.log(`Adapter unit tests server running on port ${PORT}`);
	});
}

const addTest = async (test: string) => {
	const response = await fetch(`http://localhost:${PORT}/add-test`, {
		method: "POST",
		body: test,
	});
	return response.json();
};

const resetTests = async () => {
	const response = await fetch(`http://localhost:${PORT}/reset-tests`, {
		method: "POST",
	});
	return response.json();
};

const removeTest = async (test: string) => {
	const response = await fetch(`http://localhost:${PORT}/remove-test`, {
		method: "POST",
		body: test,
	});
	return response.json();
};

const getTests = async () => {
	const response = await fetch(`http://localhost:${PORT}/get-tests`, {
		method: "GET",
	});
	return response.json();
};

/**
 * Waits for other adapter tests to complete before starting this test.
 * This is used to coordinate adapter tests that may interfere with each other
 * when running in parallel, such as tests that use the same database instance.
 */
export const waitUntilTestsAreDone = async ({
	thisTest,
	waitForTests,
}: {
	thisTest: string;
	waitForTests: string[];
}): Promise<{ done: () => Promise<void> }> => {
	let start = Date.now();
	await addTest(thisTest);
	return new Promise((r) => {
		const check = async () => {
			const tests = await getTests();
			const hasWaitingTests = waitForTests.some((test) => tests.includes(test));
			if (!hasWaitingTests) {
				clearInterval(i);
				r({
					done: async () => {
						await removeTest(thisTest);
					},
				});
				console.log(
					`starting test ${thisTest}... (waited ${Date.now() - start}ms)`,
				);
			}
		};
		// biome-ignore lint/nursery/noFloatingPromises: we need to check the tests immediately
		check();
		let i = setInterval(async () => {
			await check();
		}, 100);
	});
};
