"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

interface OAuthApplication {
	clientId: string;
	clientSecret?: string;
	type: string;
	name: string;
	icon?: string;
	metadata?: string;
	disabled?: boolean;
	redirectUrls: string;
	userId?: string;
	createdAt: Date;
	updatedAt: Date;
}

export async function deleteOAuthProvider(clientId: string) {
	try {
		// Get current session to verify user
		const session = await auth.api.getSession({
			headers: await headers(),
		});

		if (!session) {
			return {
				success: false,
				error: "Unauthorized: No active session",
			};
		}

		// Get the adapter from auth context
		const adapter = (await auth.$context).adapter;

		// First verify the provider belongs to the current user
		const provider = await adapter.findOne<OAuthApplication>({
			model: "oauthApplication",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
			],
		});

		if (!provider) {
			return {
				success: false,
				error: "OAuth provider not found",
			};
		}

		// Check if the provider belongs to the current user
		if (provider.userId !== session.user.id) {
			return {
				success: false,
				error: "Unauthorized: You don't own this OAuth provider",
			};
		}

		// Delete the provider
		await adapter.delete({
			model: "oauthApplication",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
			],
		});

		return {
			success: true,
		};
	} catch (error) {
		console.error("Error deleting OAuth provider:", error);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete OAuth provider",
		};
	}
}
