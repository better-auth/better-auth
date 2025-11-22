/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_OIDC_ISSUER: string;
	readonly VITE_OIDC_CLIENT_ID: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
