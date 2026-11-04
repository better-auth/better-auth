import { describe, expect, it } from "vitest";
import { extractRepeatedResourceFromForm } from "./resources";
import { normalizeClientAuthenticationParameters } from "./utils";

const formURLEncoded = "application/x-www-form-urlencoded";

function formRequest(body: string): Request {
	return new Request("https://auth.example.com/oauth2/token", {
		method: "POST",
		headers: { "content-type": formURLEncoded },
		body,
	});
}

function requestWithNullBody(): Request {
	// A POST that carries the form content type but has no body at all.
	return new Request("https://auth.example.com/oauth2/token", {
		method: "POST",
		headers: { "content-type": formURLEncoded },
	});
}

async function legacyTextBody(request: Request): Promise<string> {
	return await request.clone().text();
}

describe("form body decoding", () => {
	describe("extractRepeatedResourceFromForm", () => {
		it("collects repeated resource parameters in order", async () => {
			const values = await extractRepeatedResourceFromForm(
				formRequest("resource=a&resource=b&resource=c"),
			);
			expect(values).toEqual(["a", "b", "c"]);
		});

		it("drops empty resource values and returns undefined without hits", async () => {
			expect(
				await extractRepeatedResourceFromForm(
					formRequest("resource=&resource=ok&grant_type=authorization_code"),
				),
			).toEqual(["ok"]);
			expect(
				await extractRepeatedResourceFromForm(
					formRequest("grant_type=authorization_code"),
				),
			).toBeUndefined();
			expect(
				await extractRepeatedResourceFromForm(formRequest("")),
			).toBeUndefined();
		});

		it("ignores bodies that are not form-urlencoded", async () => {
			const request = new Request("https://auth.example.com/oauth2/token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ resource: ["a"] }),
			});
			expect(await extractRepeatedResourceFromForm(request)).toBeUndefined();
		});

		it("decodes urlencoded and non-ASCII values exactly like the legacy .text() path", async () => {
			const encoded =
				"resource=https%3A%2F%2Fapi.example.com%2Fv1&resource=a%2Bb&resource=%C3%A4%C3%B6%C3%BC&resource=plain+space";
			const request = formRequest(encoded);
			expect(await extractRepeatedResourceFromForm(request)).toEqual([
				"https://api.example.com/v1",
				"a+b",
				"äöü",
				"plain space",
			]);
			// Differential control: the legacy `.text()` reader must produce
			// the same URLSearchParams for the same bytes.
			const legacyParams = new URLSearchParams(await legacyTextBody(request));
			expect(legacyParams.getAll("resource")).toEqual([
				"https://api.example.com/v1",
				"a+b",
				"äöü",
				"plain space",
			]);
		});

		it("returns undefined for a null body instead of throwing", async () => {
			// arrayBuffer() on a body-less request resolves to an empty buffer,
			// so the form reader fails closed to undefined rather than
			// surfacing a TypeError.
			expect(
				await extractRepeatedResourceFromForm(requestWithNullBody()),
			).toBeUndefined();
		});
	});

	describe("normalizeClientAuthenticationParameters", () => {
		it("reads client_id and authentication fields from the form body", async () => {
			const request = formRequest(
				"grant_type=authorization_code&code=x&client_id=public-client&client_secret=shh",
			);
			const body: Record<string, unknown> = {};
			await normalizeClientAuthenticationParameters(request, body);
			expect(body.client_id).toBe("public-client");
			expect(body.client_secret).toBe("shh");
		});

		it("lets the form body override a parsed body.client_id", async () => {
			const request = formRequest("client_id=form-client");
			const body: Record<string, unknown> = { client_id: "json-client" };
			await normalizeClientAuthenticationParameters(request, body);
			expect(body.client_id).toBe("form-client");
		});

		it("rejects repeated client_id and repeated authentication fields", async () => {
			await expect(
				normalizeClientAuthenticationParameters(
					formRequest("client_id=a&client_id=b"),
					{},
				),
			).rejects.toMatchObject({
				status: "BAD_REQUEST",
				body: { error: "invalid_request" },
			});

			await expect(
				normalizeClientAuthenticationParameters(
					formRequest("client_id=a&client_secret=1&client_secret=2"),
					{},
				),
			).rejects.toMatchObject({
				status: "BAD_REQUEST",
				body: { error: "invalid_request" },
			});
		});

		it("does not read the request body when the content type is not a form", async () => {
			const request = new Request("https://auth.example.com/oauth2/token", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ client_id: "json-client" }),
			});
			const body: Record<string, unknown> = { client_id: "json-client" };
			await normalizeClientAuthenticationParameters(request, body);
			expect(body.client_id).toBe("json-client");
		});

		it("tolerates a null body instead of throwing a TypeError", async () => {
			// A body-less request resolves to an empty string for both readers
			// (a null body is not a disturbed body), so the form read yields no
			// client_id: the empty form overrides the parsed field and the
			// caller proceeds to its normal missing-client handling. Pins that
			// the arrayBuffer() reader keeps this edge identical to `.text()`.
			const body: Record<string, unknown> = { client_id: "json-client" };
			await normalizeClientAuthenticationParameters(
				requestWithNullBody(),
				body,
			);
			expect(body.client_id).toBeUndefined();
		});

		it("decodes percent-encoded client credentials exactly like the legacy .text() path", async () => {
			const encoded =
				"client_id=client%2Fwith%2Fslashes&client_secret=p%40ss+w%C3%B6rd";
			const request = formRequest(encoded);
			const body: Record<string, unknown> = {};
			await normalizeClientAuthenticationParameters(request, body);
			expect(body.client_id).toBe("client/with/slashes");
			expect(body.client_secret).toBe("p@ss wörd");
			// Differential control against the legacy reader for the same bytes.
			const legacy = new URLSearchParams(await legacyTextBody(request));
			expect(legacy.get("client_secret")).toBe("p@ss wörd");
		});
	});
});
