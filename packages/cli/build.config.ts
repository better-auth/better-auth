import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	outDir: "dist",
	externals: ["better-auth", "better-call"],
	entries: ["./src/index.ts"],
});
