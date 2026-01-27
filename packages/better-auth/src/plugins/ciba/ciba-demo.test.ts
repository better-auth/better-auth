/**
 * CIBA Demo Test
 *
 * Run with: npx vitest run packages/better-auth/src/plugins/ciba/ciba-demo.test.ts
 *
 * This demonstrates the full CIBA (Async Auth) flow with detailed logging.
 */

import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oidcProvider } from "../oidc-provider";
import { asyncAuth } from ".";

describe("Async Auth Demo - Full Flow", async () => {
	it("demonstrates complete async authentication flow", { timeout: 15000 }, async () => {
		console.log("\n🚀 Async Auth (CIBA) Demo");
		console.log("=".repeat(50));

		// Track notifications
		const mockSendNotification = vi.fn().mockImplementation(async (data) => {
			console.log("\n📧 NOTIFICATION SENT:");
			console.log(`   To: ${data.user.email}`);
			console.log(`   Client: ${data.clientId}`);
			console.log(`   Scopes: ${data.scope}`);
			console.log(`   Message: ${data.bindingMessage || "(none)"}`);
			console.log(`   Approval URL: ${data.approvalUrl}`);
			console.log(`   Expires: ${data.expiresAt.toISOString()}`);
		});

		// 1. Setup auth with Async Auth
		console.log("\n📦 Setting up Better Auth with asyncAuth plugin...");

		const { auth, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					oidcProvider({
						loginPage: "/sign-in",
						allowDynamicClientRegistration: true,
					}),
					asyncAuth({
						sendNotification: mockSendNotification,
						requestLifetime: "5m",
						pollingInterval: "5s",
					}),
				],
			},
			{ disableTestUser: false },
		);

		// 2. Register an OAuth client (the "agent")
		console.log("\n🤖 Registering AI agent as OAuth client...");
		const client = await auth.api.registerOAuthApplication({
			body: {
				redirect_uris: ["http://agent.local/callback"],
				client_name: "AI Assistant Agent",
			},
		});
		console.log(`   Client ID: ${client.client_id}`);
		console.log(`   Client Secret: ${client.client_secret?.substring(0, 10)}...`);

		// 3. Agent initiates auth request
		console.log("\n" + "=".repeat(50));
		console.log("🔐 STEP 1: Agent initiates backchannel auth request");

		const bcResponse = await auth.api.bcAuthorize({
			body: {
				client_id: client.client_id,
				client_secret: client.client_secret!,
				scope: "openid profile email offline_access",
				login_hint: "test@test.com", // Default test user
				binding_message: "Sign in to AI Assistant on MacBook Pro",
			},
		});

		console.log("\n📋 BC-Authorize Response:");
		console.log(`   auth_req_id: ${bcResponse.auth_req_id}`);
		console.log(`   expires_in: ${bcResponse.expires_in}s`);
		console.log(`   interval: ${bcResponse.interval}s`);

		expect(bcResponse.auth_req_id).toBeDefined();
		expect(mockSendNotification).toHaveBeenCalledOnce();

		// 4. Agent polls (should get authorization_pending)
		console.log("\n" + "=".repeat(50));
		console.log("⏳ STEP 2: Agent polls for token (before user approval)");

		try {
			await auth.api.oAuth2token({
				body: {
					grant_type: "urn:openid:params:grant-type:ciba",
					auth_req_id: bcResponse.auth_req_id,
					client_id: client.client_id,
					client_secret: client.client_secret!,
				},
			});
		} catch (error: unknown) {
			const err = error as { body?: { error?: string; error_description?: string } };
			console.log("\n📋 Token Response (expected pending):");
			console.log(`   error: ${err.body?.error}`);
			console.log(`   error_description: ${err.body?.error_description}`);
			expect(err.body?.error).toBe("authorization_pending");
		}

		// 5. User signs in and approves
		console.log("\n" + "=".repeat(50));
		console.log("✅ STEP 3: User approves the request");

		const { headers } = await signInWithTestUser();

		const approveResponse = await auth.api.cibaAuthorize({
			body: {
				auth_req_id: bcResponse.auth_req_id,
			},
			headers,
		});

		console.log("\n📋 Approve Response:");
		console.log(`   success: ${approveResponse.success}`);
		expect(approveResponse.success).toBe(true);

		// 6. Agent polls again (should get tokens)
		console.log("\n" + "=".repeat(50));
		console.log("🎉 STEP 4: Agent polls again and receives tokens");
		console.log("   (waiting 5s for rate limit...)");

		// Wait for polling interval to pass
		await new Promise((resolve) => setTimeout(resolve, 5100));

		const tokenResponse = await auth.api.oAuth2token({
			body: {
				grant_type: "urn:openid:params:grant-type:ciba",
				auth_req_id: bcResponse.auth_req_id,
				client_id: client.client_id,
				client_secret: client.client_secret!,
			},
		});

		console.log("\n📋 Token Response:");
		console.log(`   access_token: ${tokenResponse.access_token.substring(0, 20)}...`);
		console.log(`   token_type: ${tokenResponse.token_type}`);
		console.log(`   expires_in: ${tokenResponse.expires_in}s`);
		console.log(`   scope: ${tokenResponse.scope}`);
		if ("refresh_token" in tokenResponse && tokenResponse.refresh_token) {
			console.log(`   refresh_token: ${String(tokenResponse.refresh_token).substring(0, 20)}...`);
		}
		if ("id_token" in tokenResponse && tokenResponse.id_token) {
			console.log(`   id_token: ${String(tokenResponse.id_token).substring(0, 50)}...`);
		}

		expect(tokenResponse.access_token).toBeDefined();
		expect(tokenResponse.token_type).toBe("Bearer");
		expect(tokenResponse.refresh_token).toBeDefined(); // offline_access requested

		console.log("\n" + "=".repeat(50));
		console.log("✨ Async Auth flow completed successfully!");
		console.log("=".repeat(50) + "\n");
	});
});
