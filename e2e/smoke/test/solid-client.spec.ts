import assert from "node:assert/strict";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageDir = fileURLToPath(
	new URL("../../../packages/better-auth/", import.meta.url),
);

for (const [entry, peer] of [
	["better-auth/solid", "solid-js"],
	["better-auth/solid/v2", "solid-js-v2"],
] as const) {
	it(`${entry} binds the session to the application's Solid root`, async () => {
		const { outputFiles } = await build({
			absWorkingDir: packageDir,
			stdin: {
				contents: `export { createAuthClient } from "${entry}"; export { createRoot } from "solid-js";`,
				resolveDir: packageDir,
			},
			alias: peer === "solid-js" ? {} : { "solid-js": peer },
			bundle: true,
			platform: "browser",
			format: "esm",
			write: false,
		});
		const {
			createAuthClient,
			createRoot,
		}: {
			createAuthClient: typeof import("better-auth/solid").createAuthClient;
			createRoot: (setup: (dispose: () => void) => void) => void;
		} = await import(
			`data:text/javascript;base64,${Buffer.from(outputFiles[0]!.contents).toString("base64")}`
		);
		const client = createAuthClient({ baseURL: "http://localhost:3000" });
		const sessionAtom = client.$store.atoms.session!;
		createRoot((dispose) => {
			const session = client.useSession();
			assert.equal(session().data, null);
			assert.ok(sessionAtom.lc > 0);
			dispose();
			assert.equal(sessionAtom.lc, 0);
		});
	});
}
