import { defineConfig } from "bumpp";
import fg from "fast-glob";

export default defineConfig({
	files: fg.sync(["./packages/*/package.json"], {
		ignore: ["./packages/*-extension/package.json"],
	}),
});
