import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	outDir: "dist",
	clean: true,
	failOnWarn: false,
	entries: ["./src/index.ts"],
});
