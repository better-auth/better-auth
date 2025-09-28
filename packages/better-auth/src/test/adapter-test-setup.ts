import { type TestProject } from "vitest/node";
import { createServer } from "http";

const PORT = 7789;

const conflictingTests: string[][] = [
	// ["drizzle-mysql", "kysely-mysql"],
	// ["drizzle-pg", "kysely-pg"],
	// ["prisma-sqlite", "prisma-pg", "prisma-mysql"],
];

/**
 * This file is used to setup adapter unit tests.
 * Since test database migrations are ran in `beforeAll` hooks, it's possible
 * that vitest will run multiple `beforeAll` hooks along-side each other,
 * thus causing migrations to collide. For example, Prisma clients (despite
 * separate instances and separate DBs) will cause issues while running migrations
 * due to unknown reasons.
 *
 * Since there is no way to share state across tests,
 * we use a server to coordinate conflicting tests.
 * This acts as a coordinator to avoid race conditions,
 * ensuring each adapter tests that could collide run sequentially.
 *
 * WARNING: Do not change the name or path of this file.
 * If you do, you will need to update the `globalSetup` in `vitest.config.ts`.
 */
export default async function setup(project: TestProject) {
	// Track currently running tests
	const runningTests = new Set<string>();
	// Track completed tests for this session
	const completedTests = new Set<string>();

	project.onTestsRerun(async () => {
		// on test rerun, we reset the state
		runningTests.clear();
		completedTests.clear();
	});

	const server = createServer((req, res) => {
		const setCorsHeaders = () => {
			res.setHeader("Access-Control-Allow-Origin", "*");
			res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			res.setHeader("Access-Control-Allow-Headers", "Content-Type");
		};

		if (req.method === "OPTIONS") {
			setCorsHeaders();
			res.writeHead(200);
			res.end();
			return;
		}

		if (req.url === "/can-run-test") {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				try {
					const { testName } = JSON.parse(body);

					// Check if this test is in any conflicting group
					const conflictingGroup = conflictingTests.find((group) =>
						group.includes(testName),
					);

					if (!conflictingGroup) {
						// Not a conflicting test, allow it to run
						runningTests.add(testName);
						setCorsHeaders();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(
							JSON.stringify({ canRun: true, reason: "not-conflicting" }),
						);
						return;
					}

					// Check if any other test in the same conflicting group is currently running
					const hasConflictingTestRunning = conflictingGroup.some(
						(test) => test !== testName && runningTests.has(test),
					);

					if (hasConflictingTestRunning) {
						// Another conflicting test is running, deny this one
						setCorsHeaders();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(
							JSON.stringify({
								canRun: false,
								reason: "conflicting-test-running",
								conflictingGroup,
							}),
						);
						return;
					}

					const isFirstInGroup = conflictingGroup[0] === testName;

					if (isFirstInGroup) {
						runningTests.add(testName);
						setCorsHeaders();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(JSON.stringify({ canRun: true, reason: "first-in-group" }));
						return;
					}

					const testIndex = conflictingGroup.indexOf(testName);
					const previousTest = conflictingGroup[testIndex - 1];
					const previousTestCompleted = completedTests.has(previousTest || "");

					if (previousTestCompleted) {
						// Previous test completed, allow this one to run
						runningTests.add(testName);
						setCorsHeaders();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(
							JSON.stringify({ canRun: true, reason: "previous-completed" }),
						);
						return;
					}

					// Check if the previous test is running or if we should wait
					// If the previous test is not running and not completed,
					// and no other test in the group is running, allow this one to run
					const previousTestRunning = runningTests.has(previousTest || "");
					const anyTestInGroupRunning = conflictingGroup.some(
						(test) => test !== testName && runningTests.has(test),
					);

					if (
						!previousTestRunning &&
						!previousTestCompleted &&
						!anyTestInGroupRunning
					) {
						// Previous test is not running and not completed, and no other test is running
						// This means the previous test is not part of this test run, so allow this one
						runningTests.add(testName);
						setCorsHeaders();
						res.writeHead(200, { "Content-Type": "application/json" });
						res.end(
							JSON.stringify({
								canRun: true,
								reason: "previous-test-not-running",
							}),
						);
						return;
					}

					// Previous test hasn't completed yet, deny this one
					setCorsHeaders();
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							canRun: false,
							reason: "waiting-for-previous",
							waitingFor: previousTest,
							conflictingGroup,
						}),
					);
				} catch (error) {
					setCorsHeaders();
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
		} else if (req.url === "/test-completed") {
			let body = "";
			req.on("data", (chunk) => {
				body += chunk.toString();
			});
			req.on("end", () => {
				try {
					const { testName } = JSON.parse(body);

					// Mark test as completed and remove from running
					runningTests.delete(testName);
					completedTests.add(testName);

					setCorsHeaders();
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(
						JSON.stringify({
							success: true,
							runningTests: Array.from(runningTests),
							completedTests: Array.from(completedTests),
						}),
					);
				} catch (error) {
					setCorsHeaders();
					res.writeHead(400, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Invalid JSON body" }));
				}
			});
		} else if (req.url === "/status") {
			// Debug endpoint to check current state
			setCorsHeaders();
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(
				JSON.stringify({
					runningTests: Array.from(runningTests),
					completedTests: Array.from(completedTests),
					conflictingGroups: conflictingTests,
				}),
			);
		} else {
			setCorsHeaders();
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Endpoint not found" }));
		}
	});

	server.listen(PORT, () => {});
}

/**
 * Checks if a test can run by querying the coordinator server.
 * Returns a promise that resolves when the test is allowed to run.
 */
export const canRunTest = async (testName: string): Promise<boolean> => {
	return new Promise((resolve) => {
		const checkCanRun = async () => {
			try {
				const response = await fetch(`http://localhost:${PORT}/can-run-test`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ testName }),
				});

				const result = await response.json();

				if (result.canRun) {
					console.log(`Test ${testName} can run: ${result.reason}`);
					resolve(true);
				} else {
					console.log(`Test ${testName} cannot run: ${result.reason}`);
					if (result.waitingFor) {
						console.log(`Waiting for ${result.waitingFor} to complete...`);
					}
					setTimeout(checkCanRun, 1000);
				}
			} catch (error) {
				console.error(`Error checking if test ${testName} can run:`, error);
				// On error, allow the test to run to avoid blocking
				resolve(true);
			}
		};
		// biome-ignore lint/nursery/noFloatingPromises: -
		checkCanRun();
	});
};

/**
 * Marks a test as completed in the coordinator server.
 */
export const markTestCompleted = async (testName: string): Promise<void> => {
	try {
		const response = await fetch(`http://localhost:${PORT}/test-completed`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ testName }),
		});

		const result = await response.json();
		if (result.success) {
			console.log(`Test ${testName} marked as completed`);
		}
	} catch (error) {
		console.error(`Error marking test ${testName} as completed:`, error);
	}
};

// we type out every test so that any new tests is forced to update this list.
// NOTE: If you're here to add a new test, make sure to check if any other databases will not run into
// migration conflicts. If so, please update the `conflictingTests` array at the top of this file.
type allAdapterTests =
	| "kysely-mysql"
	| "kysely-pg"
	| "kysely-sqlite"
	| "kysely-mssql"
	| "memory"
	| "drizzle-mysql"
	| "drizzle-pg"
	| "drizzle-sqlite"
	| "prisma-sqlite"
	| "prisma-pg"
	| "prisma-mysql";

/**
 * Waits for permission to run a test and returns a cleanup function.
 */
export const waitForTestPermission = async (
	testName: allAdapterTests,
): Promise<{ done: () => Promise<void> }> => {
	const start = Date.now();

	// Wait for permission to run
	await canRunTest(testName);

	console.log(`Test ${testName} starting... (waited ${Date.now() - start}ms)`);

	return {
		done: async () => {
			await markTestCompleted(testName);
		},
	};
};
