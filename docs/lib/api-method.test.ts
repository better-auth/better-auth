import { describe, expect, it } from "vitest";
import { generateApiMethodExamples, parseApiMethod } from "./api-method";

const definition = parseApiMethod(`type verifyTotp = {
  /**
   * The current one-time password.
   */
  code: string = "123456"
  /**
	 * @serverOnly - Only available on the server.
   */
  metadata?: {
    ipAddress?: string = "127.0.0.1"
  }
}`);

describe("API method code generation", () => {
	it("parses the shared API method definition", () => {
		expect(definition.functionName).toBe("verifyTotp");
		expect(definition.typeDefinition).toContain("type verifyTotp");
		expect(definition.properties).toEqual([
			expect.objectContaining({
				name: "code",
				exampleValue: '"123456"',
				description: "The current one-time password.",
			}),
			expect.objectContaining({
				name: "metadata",
				type: "Object",
				serverOnly: true,
				description: "Only available on the server.",
			}),
			expect.objectContaining({
				name: "ipAddress",
				path: ["metadata"],
				serverOnly: true,
			}),
		]);
	});

	it("generates the same examples for UI and Markdown", () => {
		const examples = generateApiMethodExamples(definition, {
			path: "/two-factor/verify-totp",
			method: "POST",
			requireHeaders: true,
			headersComment: "Forward the current request headers.",
		});

		expect(examples.client).toContain(
			"await authClient.twoFactor.verifyTotp({",
		);
		expect(examples.client).toContain("The current one-time password.");
		expect(examples.client).not.toContain("metadata");
		expect(examples.server).toContain("const data = await auth.api.verifyTotp");
		expect(examples.server).toContain("The current one-time password.");
		expect(examples.server).toContain("Forward the current request headers.");
		expect(examples.server).toContain("headers: await headers()");
		expect(examples.server).toContain("metadata: {");
	});

	it("uses query parameters and result aliases", () => {
		const examples = generateApiMethodExamples(definition, {
			path: "/admin/list-users",
			method: "GET",
			resultVariable: "users",
		});

		expect(examples.client).toContain("const { data: users, error } =");
		expect(examples.client).toContain("query:");
		expect(examples.server).toContain("const users =");
		expect(examples.server).toContain("query:");
	});

	it("inherits visibility directives through nested properties", () => {
		const nestedDefinition = parseApiMethod(`type updateMetadata = {
  /**
   * @serverOnly
   */
  metadata?: {
    audit?: {
      ipAddress?: string = "127.0.0.1"
    }
  }
}`);

		expect(
			nestedDefinition.properties
				.filter((property) =>
					["metadata", "audit", "ipAddress"].includes(property.name),
				)
				.map((property) => property.serverOnly),
		).toEqual([true, true, true]);
	});

	it("closes nested properties after filtering hidden children", () => {
		const clientDefinition = parseApiMethod(`type updateProfile = {
  options?: {
    visible?: string = "visible"
    /**
     * @serverOnly
     */
    serverSecret?: string = "server"
  }
  name: string = "name"
}`);
		const serverDefinition = parseApiMethod(`type updateProfile = {
  options?: {
    visible?: string = "visible"
    /**
     * @clientOnly
     */
    clientSecret?: string = "client"
  }
  name: string = "name"
}`);
		const clientExamples = generateApiMethodExamples(clientDefinition, {
			path: "/update-profile",
			method: "POST",
		});
		const serverExamples = generateApiMethodExamples(serverDefinition, {
			path: "/update-profile",
			method: "POST",
		});

		expect(clientExamples.client).not.toContain("serverSecret");
		expect(clientExamples.client).toContain(
			'visible: "visible",\n    },\n    name:',
		);
		expect(serverExamples.server).not.toContain("clientSecret");
		expect(serverExamples.server).toContain(
			'visible: "visible",\n        },\n        name:',
		);
	});

	it("merges bearer tokens with forwarded request headers", () => {
		const examples = generateApiMethodExamples(definition, {
			path: "/two-factor/verify-totp",
			method: "POST",
			requireHeaders: true,
			requireBearerToken: true,
		});

		expect(examples.server.match(/headers:/g)).toHaveLength(1);
		expect(examples.server).toContain("...(await headers())");
		expect(examples.server).toContain("authorization: 'Bearer <token>'");
	});

	it("closes objects when all nested properties are hidden", () => {
		const clientDefinition = parseApiMethod(`type updateProfile = {
  options?: {
    /**
     * @serverOnly
     */
    secret?: string = "secret"
  }
  name: string = "name"
}`);
		const serverDefinition = parseApiMethod(`type updateProfile = {
  options?: {
    /**
     * @clientOnly
     */
    secret?: string = "secret"
  }
  name: string = "name"
}`);
		const options = { path: "/update-profile", method: "POST" } as const;

		expect(
			generateApiMethodExamples(clientDefinition, options).client,
		).toContain("options: {\n    },\n    name:");
		expect(
			generateApiMethodExamples(serverDefinition, options).server,
		).toContain("options: {\n        },\n        name:");
	});
});
