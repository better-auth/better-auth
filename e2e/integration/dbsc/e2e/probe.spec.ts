import type { Browser, TestInfo } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CHANNEL, launch } from "./chrome";
import type { RequestLog, Scenario } from "./probe-server";
import { BOUND_COOKIE, SESSION_COOKIE, startProbeServer } from "./probe-server";

/**
 * Probes real Chromium DBSC behavior that sources disagree on. These are
 * observations first: each test records the wire and CDP events so the
 * plugin design can be settled against the browser, not documentation.
 *
 * @see https://w3c.github.io/webappsec-dbsc/
 */

async function probe(scenario: Scenario, testInfo: TestInfo) {
	const server = await startProbeServer(scenario);
	const browser: Browser = await launch(server.spkiHash);
	const context = await browser.newContext({ ignoreHTTPSErrors: false });
	const page = await context.newPage();
	const events: unknown[] = [];
	const cdp = await context.newCDPSession(page);
	cdp.on("Network.deviceBoundSessionEventOccurred", (event) =>
		events.push(event),
	);
	await cdp.send("Network.enable");
	await cdp
		.send(
			"Network.enableDeviceBoundSessions" as "Network.enable",
			{
				enable: true,
			} as never,
		)
		.catch(() => undefined);

	const requests = (path: string) =>
		server.log.filter((entry) => entry.path === path);

	const crossSite = server.origin.replace("localhost", "127.0.0.1");

	const signIn = async (entry?: "script" | "redirect") => {
		const login = `${server.origin}/login`;
		const target =
			entry === "script"
				? `${crossSite}/start?to=${encodeURIComponent(login)}`
				: entry === "redirect"
					? `${crossSite}/start?to=${encodeURIComponent(`${crossSite}/bounce?to=${encodeURIComponent(login)}`)}`
					: login;
		await page.goto(target);
		await expect
			.poll(() => requests("/dbsc/register").length, { timeout: 15_000 })
			.toBeGreaterThan(0);
	};

	// Deleting the bound cookie makes the next in-scope request refresh.
	const visitWithoutBoundCookie = async (path: string) => {
		await context.clearCookies({ name: BOUND_COOKIE });
		await page.goto(`${server.origin}${path}`);
	};

	const finish = async () => {
		const summary = {
			channel: CHANNEL,
			version: browser.version(),
			requests: server.log.map(summarize),
			events,
		};
		await testInfo.attach("observations", {
			body: JSON.stringify(summary, null, 2),
			contentType: "application/json",
		});
		console.log(
			`[dbsc-probe] ${testInfo.title}\n${JSON.stringify(summary, null, 2)}`,
		);
		await browser.close();
		await server.close();
	};

	return {
		server,
		page,
		context,
		crossSite,
		requests,
		signIn,
		visitWithoutBoundCookie,
		finish,
	};
}

function summarize(entry: RequestLog) {
	const cookie = entry.headers.cookie;
	const raw = entry.headers["secure-session-response"];
	return {
		request: `${entry.method} ${entry.path} -> ${entry.status}`,
		origin: entry.headers.origin,
		secFetchSite: entry.headers["sec-fetch-site"],
		secFetchMode: entry.headers["sec-fetch-mode"],
		secFetchDest: entry.headers["sec-fetch-dest"],
		hasSessionCookie:
			typeof cookie === "string" && cookie.includes(`${SESSION_COOKIE}=`),
		hasBoundCookie:
			typeof cookie === "string" && cookie.includes(`${BOUND_COOKIE}=`),
		sessionIdHeader: entry.headers["sec-secure-session-id"],
		skipped: entry.headers["secure-session-skipped"],
		proofQuoted: typeof raw === "string" ? raw.startsWith('"') : undefined,
		proof: entry.proof,
	};
}

test.describe("DBSC wire probe", () => {
	// These record what the browser does rather than test the plugin, so they
	// run on demand: DBSC_PROBE=1, and DBSC_PROBE_CHANNEL=chrome for stable.
	test.skip(!process.env.DBSC_PROBE, "set DBSC_PROBE=1 to run");

	test("registers, then refreshes through a 403 challenge", async ({}, testInfo) => {
		const p = await probe({}, testInfo);
		await p.signIn();
		await p.visitWithoutBoundCookie("/protected");
		await expect
			.poll(
				() =>
					p.requests("/dbsc/refresh").filter((entry) => entry.status === 200)
						.length,
				{ timeout: 15_000 },
			)
			.toBeGreaterThan(0);
		await p.finish();
	});

	test("caches a challenge sent on the registration response", async ({}, testInfo) => {
		const p = await probe({ challengeOnRegistration: true }, testInfo);
		await p.signIn();
		await p.visitWithoutBoundCookie("/protected");
		await expect
			.poll(() => p.requests("/dbsc/refresh").length, { timeout: 15_000 })
			.toBeGreaterThan(0);
		await p.finish();
	});

	test("uses a challenge cached from a refresh 200", async ({}, testInfo) => {
		const p = await probe({}, testInfo);
		await p.signIn();
		await p.visitWithoutBoundCookie("/first");
		await expect
			.poll(
				() =>
					p.requests("/dbsc/refresh").filter((entry) => entry.status === 200)
						.length,
				{ timeout: 15_000 },
			)
			.toBe(1);
		await p.visitWithoutBoundCookie("/second");
		await expect
			.poll(
				() =>
					p.requests("/dbsc/refresh").filter((entry) => entry.status === 200)
						.length,
				{ timeout: 15_000 },
			)
			.toBe(2);
		await p.finish();
	});

	test("stops after repeated 403 challenges", async ({}, testInfo) => {
		const p = await probe({ refresh: () => ({ kind: "challenge" }) }, testInfo);
		await p.signIn();
		await p.visitWithoutBoundCookie("/first");
		await p.page.waitForTimeout(3_000);
		const afterFirst = p.requests("/dbsc/refresh").length;
		// Whether the session survived shows in whether a later visit refreshes.
		await p.visitWithoutBoundCookie("/second");
		await p.page.waitForTimeout(3_000);
		console.log(
			`[dbsc-probe] refresh attempts: first visit ${afterFirst}, total ${p.requests("/dbsc/refresh").length}`,
		);
		await p.finish();
	});

	for (const entry of ["script", "redirect"] as const) {
		test(`registers after a cross-site ${entry} navigation`, async ({}, testInfo) => {
			const p = await probe({}, testInfo);
			await p.signIn(entry).catch(() => undefined);
			await p.page.waitForTimeout(3_000);
			console.log(
				`[dbsc-probe] cross-site ${entry}: register attempts ${p.requests("/dbsc/register").length}`,
			);
			await p.finish();
		});
	}

	test("refreshes on a cross-site navigation into the origin", async ({}, testInfo) => {
		const p = await probe({}, testInfo);
		await p.signIn();
		await p.context.clearCookies({ name: BOUND_COOKIE });
		const target = `${p.server.origin}/protected`;
		await p.page.goto(`${p.crossSite}/start?to=${encodeURIComponent(target)}`);
		await p.page.waitForURL(target);
		await p.page.waitForTimeout(3_000);
		await p.finish();
	});

	test("registers from a header on a 302 response", async ({}, testInfo) => {
		const p = await probe({}, testInfo);
		const login = `${p.server.origin}/login?redirect=1`;
		await p.page.goto(`${p.crossSite}/start?to=${encodeURIComponent(login)}`);
		await p.page.waitForTimeout(3_000);
		console.log(
			`[dbsc-probe] 302: register attempts ${p.requests("/dbsc/register").length}`,
		);
		await p.finish();
	});

	test("refreshes before a cross-site navigation when initiators are allowed", async ({}, testInfo) => {
		const p = await probe(
			{ allowedRefreshInitiators: ["*"], challengeOnRegistration: true },
			testInfo,
		);
		await p.signIn();
		// Leave the origin first so nothing same-site can trigger the refresh.
		await p.page.goto(`${p.crossSite}/idle`);
		await p.page.waitForTimeout(1_500);
		await p.context.clearCookies({ name: BOUND_COOKIE });
		const target = `${p.server.origin}/protected`;
		await p.page.evaluate((url) => {
			location.href = url;
		}, target);
		await p.page.waitForURL(target);
		await p.page.waitForTimeout(2_000);
		await p.finish();
	});

	test("refreshes once for a page that loads many assets", async ({}, testInfo) => {
		const p = await probe({ challengeOnRegistration: true }, testInfo);
		await p.signIn();
		await p.page.waitForTimeout(1_000);
		const before = p.requests("/dbsc/refresh").length;
		await p.visitWithoutBoundCookie("/gallery");
		await p.page.waitForTimeout(3_000);
		const assets = p.server.log.filter((entry) =>
			entry.path.startsWith("/asset/"),
		);
		console.log(
			`[dbsc-probe] gallery: refreshes ${p.requests("/dbsc/refresh").length - before}, assets ${assets.length}, assets with bound cookie ${assets.filter((entry) => String(entry.headers.cookie).includes("bound=")).length}`,
		);

		// The burst Report URI hit: the cookie is gone while a loaded page
		// requests several assets at the same moment.
		const start = p.requests("/dbsc/refresh").length;
		await p.context.clearCookies({ name: BOUND_COOKIE });
		await p.page.evaluate(async () => {
			await Promise.all(
				Array.from({ length: 8 }, (_, i) =>
					fetch(`/asset/burst-${i}.png`).then((response) => response.text()),
				),
			);
		});
		console.log(
			`[dbsc-probe] burst: refreshes ${p.requests("/dbsc/refresh").length - start} for 8 parallel requests`,
		);
		await p.finish();
	});

	for (const status of [400, 429, 503]) {
		test(`keeps or deletes the session after a ${status} refresh`, async ({}, testInfo) => {
			const p = await probe(
				{
					refresh: ({ attempt, proof }) =>
						attempt === 1
							? { kind: "status", status }
							: proof?.verified
								? { kind: "ok", challenge: true }
								: { kind: "challenge" },
				},
				testInfo,
			);
			await p.signIn();
			await p.visitWithoutBoundCookie("/first");
			await p.page.waitForTimeout(3_000);
			const afterFirst = p.requests("/dbsc/refresh").length;
			await p.visitWithoutBoundCookie("/second");
			await p.page.waitForTimeout(3_000);
			console.log(
				`[dbsc-probe] ${status}: refresh attempts first visit ${afterFirst}, total ${p.requests("/dbsc/refresh").length}`,
			);
			await p.finish();
		});
	}
});
