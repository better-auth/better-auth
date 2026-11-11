import assert from "node:assert";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import type { BuildOptions } from "esbuild";
import { build } from "esbuild";

const esbuildDir = fileURLToPath(
	new URL("./fixtures/esbuild", import.meta.url),
);

function bundle(entry: string, options?: BuildOptions) {
	return build({
		...options,
		absWorkingDir: esbuildDir,
		entryPoints: [`src/${entry}.ts`],
		bundle: true,
		write: false,
		metafile: true,
		logLevel: "silent",
	});
}

/**
 * @see https://github.com/better-auth/better-auth/issues/6213
 */
it("build client without zod runtime", async () => {
	const { outputFiles } = await bundle("client");
	const outputContent = outputFiles[0]!.text;
	assert.ok(
		!outputContent.includes("ZodString"),
		"Client bundle should not contain Zod runtime code (ZodString)",
	);
	assert.ok(
		!outputContent.includes("ZodObject"),
		"Client bundle should not contain Zod runtime code (ZodObject)",
	);
});

// The metafile also lists tree-shaken inputs, so count only bytes kept in the output.
async function bundledKyselyBytes(entry: string, options?: BuildOptions) {
	const { metafile } = await bundle(entry, options);
	return Object.values(metafile.outputs)
		.flatMap((output) => Object.entries(output.inputs))
		.filter(([path]) => /\/kysely(-adapter)?\//.test(path))
		.reduce((sum, [, input]) => sum + input.bytesInOutput, 0);
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12312
 */
it("build minimal with Drizzle and Expo without Kysely", async () => {
	assert.strictEqual(await bundledKyselyBytes("minimal"), 0);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12312
 */
it("split minimal with Drizzle and Expo without Kysely chunks", async () => {
	// Splitting emits a chunk for every dynamic import, even in tree-shaken code.
	const kyselyBytes = await bundledKyselyBytes("minimal", {
		format: "esm",
		splitting: true,
		outdir: "dist",
	});
	assert.strictEqual(kyselyBytes, 0);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12312
 */
it("split plugin packages without Kysely chunks", async () => {
	const kyselyBytes = await bundledKyselyBytes("plugins", {
		format: "esm",
		splitting: true,
		outdir: "dist",
		platform: "node",
	});
	assert.strictEqual(kyselyBytes, 0);
});

it("detects Kysely in the full build", async () => {
	assert.ok((await bundledKyselyBytes("full")) > 0);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10865
 */
it("build organization plugin without unused zod locales", async () => {
	const { outputFiles } = await bundle("organization");
	const locales =
		outputFiles[0]!.text.match(/zod\/v4\/locales\/[\w-]+\.js/g) ?? [];
	const unusedLocales = locales.filter(
		(locale) =>
			locale !== "zod/v4/locales/en.js" && locale !== "zod/v4/locales/index.js",
	);
	assert.deepStrictEqual(
		unusedLocales,
		[],
		"Built output should not contain unused zod locales",
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10366
 */
it("bundles the Kysely adapter with Kysely 0.29", async () => {
	await bundle("kysely-adapter", {
		platform: "node",
		alias: {
			kysely: "kysely-029",
		},
	});
});
