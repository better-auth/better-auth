import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "./base.prisma",
	datasource: {
		url: "file:./dev.db",
	},
});
