import { createAuthClient } from "better-auth/client";

const client = createAuthClient({
	baseURL: "http://localhost:3000",
});

async function testConnection() {
	await client.signIn.email({
		email: "test@test.com",
		password: "password123",
	});
}

document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("test-btn");
	button?.addEventListener("click", testConnection);

	console.log("Better Auth client initialized");
});
