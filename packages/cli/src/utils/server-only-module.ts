/**
 * `server-only` (used by Next.js and other React Server Components setups)
 * throws when it is imported outside the `react-server` export condition. The
 * CLI loads `auth.ts` with jiti in plain Node, so a config that imports it
 * could not be read. Users had to delete the import, run the CLI, and add it
 * back.
 *
 * The CLI only reads the config, it never bundles it for a client, so the
 * guard has nothing to protect here. The import is aliased to an empty module,
 * the same file the package itself resolves to under `react-server`.
 *
 * @see https://www.npmjs.com/package/server-only
 */
const SERVER_ONLY_STUB_MODULE = `data:text/javascript;charset=utf-8,${encodeURIComponent(
	"export {};\n// jiti dirty hack: .unknown\n",
)}`;

export function addServerOnlyModule(aliases: Record<string, string>) {
	if (!aliases["server-only"]) {
		aliases["server-only"] = SERVER_ONLY_STUB_MODULE;
	}
}
