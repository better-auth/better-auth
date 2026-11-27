import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { createSAMLPostForm } from "../../../../packages/sso/src/routes/helpers";

const payload = Buffer.from("logout-response").toString("base64");
const relayState = "logout?state=a&return=b";

async function createPostBindingFixture() {
	let origin = "";
	let callbackReceived = false;
	let submitted: Record<string, string> = {};
	const server = createServer(async (request, response) => {
		if (request.url === "/callback" && request.method === "POST") {
			let body = "";
			for await (const chunk of request) body += chunk;
			submitted = Object.fromEntries(new URLSearchParams(body));
			callbackReceived = true;
			response.writeHead(200, { "Content-Type": "text/html" });
			response.end("<title>Logout response accepted</title>");
			return;
		}
		if (request.url === "/form") {
			const form = createSAMLPostForm(
				`${origin}/callback`,
				"SAMLResponse",
				payload,
				relayState,
			);
			response.writeHead(form.status, Object.fromEntries(form.headers));
			response.end(await form.text());
			return;
		}
		if (request.url === "/result") {
			response.writeHead(200, { "Content-Type": "text/html" });
			response.end(
				`<title>Logout finished</title><pre>${JSON.stringify({ callbackReceived, submitted })}</pre>`,
			);
			return;
		}
		response.writeHead(200, { "Content-Type": "text/html" });
		response.end(`<!DOCTYPE html><button id="run">Run iframe logout</button><script>
			document.getElementById('run').onclick = () => {
				const frame = document.createElement('iframe');
				frame.src = '/form';
				frame.onload = () => {
					frame.remove();
					window.location.assign('/result');
				};
				document.body.append(frame);
			};
		</script>`);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing test server address");
	origin = `http://127.0.0.1:${address.port}`;
	return {
		origin,
		evidence: () => ({ callbackReceived, submitted }),
		async close() {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}

/**
 * @see https://developer.okta.com/docs/guides/single-logout/saml2/main/
 */
test("posts a SAML response before its parent finishes iframe logout", async ({
	page,
}, testInfo) => {
	const fixture = await createPostBindingFixture();
	try {
		await page.goto(fixture.origin);
		await page.getByRole("button", { name: "Run iframe logout" }).click();
		await expect(page).toHaveTitle("Logout finished");
		const evidence = JSON.parse(await page.locator("pre").innerText());
		await testInfo.attach("post-binding-result", {
			body: JSON.stringify(evidence),
			contentType: "application/json",
		});
		expect(evidence.callbackReceived).toBe(true);
		expect(evidence.submitted).toEqual({
			SAMLResponse: payload,
			RelayState: relayState,
		});
	} finally {
		await fixture.close();
	}
});

/**
 * @see https://docs.oasis-open.org/security/saml/v2.0/saml-bindings-2.0-os.pdf
 */
test("retains manual POST continuation without JavaScript", async ({
	browser,
}, testInfo) => {
	const fixture = await createPostBindingFixture();
	const context = await browser.newContext({ javaScriptEnabled: false });
	try {
		const page = await context.newPage();
		await page.goto(`${fixture.origin}/form`);
		await page.getByRole("button", { name: "Continue", exact: true }).click();
		await expect(page).toHaveTitle("Logout response accepted");
		const evidence = fixture.evidence();
		await testInfo.attach("manual-post-result", {
			body: JSON.stringify(evidence),
			contentType: "application/json",
		});
		expect(evidence.callbackReceived).toBe(true);
		expect(evidence.submitted).toEqual({
			SAMLResponse: payload,
			RelayState: relayState,
		});
	} finally {
		await context.close();
		await fixture.close();
	}
});
