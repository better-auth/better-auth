import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins/organization";
import { MongoClient, ObjectId } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const client = new MongoClient("mongodb://127.0.0.1:27017");
const db = client.db("better-auth-organization-invitation");

beforeAll(async () => {
	await client.connect();
	await db.dropDatabase();
});

afterAll(async () => {
	await db.dropDatabase();
	await client.close();
});

describe("organization invitation ids on MongoDB", () => {
	it("stores a random id instead of an ObjectId and finds the invitation by it", async () => {
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			secret: "better-auth-secret-that-is-long-enough-for-tests",
			database: mongodbAdapter(db, {
				transaction: false,
			}),
			emailAndPassword: {
				enabled: true,
			},
			plugins: [organization()],
		});
		const { headers } = await auth.api.signUpEmail({
			body: {
				email: "owner@example.com",
				password: "password-1234",
				name: "Owner",
			},
			returnHeaders: true,
		});
		const sessionHeaders = new Headers({
			cookie: headers.getSetCookie().join("; "),
		});
		const org = await auth.api.createOrganization({
			body: {
				name: "Acme",
				slug: "acme",
			},
			headers: sessionHeaders,
		});
		const invitation = await auth.api.createInvitation({
			body: {
				organizationId: org!.id,
				email: "invitee@example.com",
				role: "member",
			},
			headers: sessionHeaders,
		});

		expect(invitation.id).toMatch(/^[A-Za-z0-9]{32}$/);
		expect(ObjectId.isValid(invitation.id)).toBe(false);

		const stored = await db
			.collection("invitation")
			.findOne({ email: "invitee@example.com" });
		expect(stored?._id).toBe(invitation.id);

		const listed = await auth.api.listInvitations({
			query: {
				organizationId: org!.id,
			},
			headers: sessionHeaders,
		});
		expect(listed.map((row) => row.id)).toEqual([invitation.id]);

		const canceled = await auth.api.cancelInvitation({
			body: {
				invitationId: invitation.id,
			},
			headers: sessionHeaders,
		});
		expect(canceled?.status).toBe("canceled");
	});
});
