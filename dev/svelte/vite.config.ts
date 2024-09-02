import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		exclude: ["@node-rs/argon2", "@node-rs/bcrypt"],
	},
});
