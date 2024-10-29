import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	declaration: true,
	externals: ["better-auth"],
});
