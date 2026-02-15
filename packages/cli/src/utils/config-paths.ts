let possiblePaths = [
	"auth.ts",
	"auth.tsx",
	"auth.js",
	"auth.jsx",
	"auth.server.js",
	"auth.server.ts",
	"auth/index.ts",
	"auth/index.tsx",
	"auth/index.js",
	"auth/index.jsx",
	"auth/index.server.js",
	"auth/index.server.ts",
];

possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `lib/server/${it}`),
	...possiblePaths.map((it) => `server/auth/${it}`),
	...possiblePaths.map((it) => `server/${it}`),
	...possiblePaths.map((it) => `auth/${it}`),
	...possiblePaths.map((it) => `lib/${it}`),
	...possiblePaths.map((it) => `utils/${it}`),
];
possiblePaths = [
	...possiblePaths,
	...possiblePaths.map((it) => `src/${it}`),
	...possiblePaths.map((it) => `app/${it}`),
];

export const possibleAuthConfigPaths = possiblePaths;

let _possibleClientConfigPaths = [
	"auth-client.ts",
	"auth-client.tsx",
	"auth-client.js",
	"auth-client.jsx",
	"auth-client.server.js",
	"auth-client.server.ts",
	"auth-client/index.ts",
	"auth-client/index.tsx",
	"auth-client/index.js",
	"auth-client/index.jsx",
	"auth-client/index.server.js",
	"auth-client/index.server.ts",
];

_possibleClientConfigPaths = [
	..._possibleClientConfigPaths,
	..._possibleClientConfigPaths.map((it) => `lib/server/${it}`),
	..._possibleClientConfigPaths.map((it) => `server/auth/${it}`),
	..._possibleClientConfigPaths.map((it) => `server/${it}`),
	..._possibleClientConfigPaths.map((it) => `auth/${it}`),
	..._possibleClientConfigPaths.map((it) => `lib/${it}`),
	..._possibleClientConfigPaths.map((it) => `utils/${it}`),
];
_possibleClientConfigPaths = [
	..._possibleClientConfigPaths,
	..._possibleClientConfigPaths.map((it) => `src/${it}`),
	..._possibleClientConfigPaths.map((it) => `app/${it}`),
];

export const possibleClientConfigPaths = _possibleClientConfigPaths;
