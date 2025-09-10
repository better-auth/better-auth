import { defineConfig } from "vite";

export default defineConfig({
	server: {
		allowedHosts: ["test.com", "localhost"],
		https:
			process.env.HTTPS === "1"
				? {
						key: "./e2e/fixtures/private-key.pem",
						cert: "./e2e/fixtures/certificate.pem",
					}
				: undefined,
	},
});
