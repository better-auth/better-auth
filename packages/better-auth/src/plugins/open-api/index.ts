import { generator } from "./generator";
import { logo } from "./logo";
import type { BetterAuthPlugin } from "@better-auth/core";
import type { LiteralString } from "../../types/helper";

import { APIError } from "../../api";
import { createAuthEndpoint } from "@better-auth/core/api";

export type { FieldSchema, Path, OpenAPIModelSchema } from "./generator";

type ScalarTheme =
	| "alternate"
	| "default"
	| "moon"
	| "purple"
	| "solarized"
	| "bluePlanet"
	| "saturn"
	| "kepler"
	| "mars"
	| "deepSpace"
	| "laserwave"
	| "none";

type ScalarHttpClient =
	| "libcurl"
	| "clj_http"
	| "httpclient"
	| "restsharp"
	| "native"
	| "http1.1"
	| "asynchttp"
	| "nethttp"
	| "okhttp"
	| "unirest"
	| "xhr"
	| "axios"
	| "fetch"
	| "jquery"
	| "okhttp"
	| "native"
	| "request"
	| "unirest"
	| "axios"
	| "fetch"
	| "nsurlsession"
	| "cohttp"
	| "curl"
	| "guzzle"
	| "http1"
	| "http2"
	| "webrequest"
	| "restmethod"
	| "python3"
	| "requests"
	| "httr"
	| "native"
	| "curl"
	| "httpie"
	| "wget"
	| "nsurlsession"
	| "undici";

type ScalarHttpClientState = {
	targetKey: string;
	clientKey: ScalarHttpClient;
};

const getScalarConfig = (cfg?: OpenAPIOptions) => {
	const { path: _, ...options } = cfg || {};
	const configuration = {
		favicon: `data:image/svg+xml;utf8,${encodeURIComponent(logo)}`,
		metaData: {
			title: "Better Auth API",
			description: "API Reference for your Better Auth Instance",
			...options.metaData,
		},
		...options,
	};

	return JSON.stringify(configuration);
};

const getHTML = (
	apiReference: Record<string, any>,
	options?: OpenAPIOptions,
) => `<!doctype html>
<html>
  <head>
    <title>Scalar API Reference</title>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      type="application/json">
    ${JSON.stringify(apiReference)}
    </script>
	 <script>
      document.getElementById('api-reference').dataset.configuration = ${JSON.stringify(getScalarConfig(options))};
    </script>
	  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;

interface OpenAPIScalarOptions {
	/**
	 * Theme of the OpenAPI reference page.
	 *
	 * @default "default"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__theme}
	 */
	theme?: ScalarTheme;
	/**
	 * You can pass custom CSS directly to the component.
	 *
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__customcss}
	 */
	customCss?: string;
	/**
	 * Whether dark mode is on or off initially (light mode).
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__darkmode}
	 */
	darkMode?: boolean;
	/**
	 * @default
	 * ```ts
	 * {
	 * 	targetKey: "shell",
	 * 	clientKey: "curl",
	 * }
	 * ```
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__defaulthttpclient}
	 */
	defaultHttpClient?: ScalarHttpClientState;
	/**
	 * By default we only open the relevant tag based on the url,
	 * however if you want all the tags open by default then set
	 * this configuration option.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__defaultopenalltags}
	 */
	defaultOpenAllTags?: boolean;
	/**
	 * Sets the file type of the document to download, set to 'none' to hide the download button.
	 *
	 * @default "both"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__documentdownloadtype}
	 */
	documentDownloadType?: "json" | "yaml" | "both" | "direct" | "none";
	/**
	 * By default the models are all closed in the model section at the bottom, this flag will open them all by default.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__expandallmodelsections}
	 */
	expandAllModelSections?: boolean;
	/**
	 * By default response sections are closed in the operations. This flag will open them by default.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__expandallresponses}
	 */
	expandAllResponses?: boolean;
	/**
	 * You can specify the path to a favicon to be used for the documentation.
	 *
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__favicon}
	 */
	favicon?: string;
	/**
	 * Force dark mode to always be this state no matter what.
	 *
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__forcedarkmodestate}
	 */
	forceDarkModeState?: "dark" | "light";
	/**
	 * Whether to show the client button from the reference sidebar and modal.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__hideclientbutton}
	 */
	hideClientButton?: boolean;
	/**
	 * Whether to show the dark mode toggle.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__properties__hidedarkmodetoggle}
	 */
	hideDarkModeToggle?: boolean;
	/**
	 * Every operation can have a operationId, a unique string used to
	 * identify the operation, but it's optional.
	 *
	 * By default we don't render it in the UI. If it's helpful to show
	 * it to your users, enable it like this:
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid}
	 */
	showOperationId?: boolean;
	/**
	 * Whether models (`components.schemas` or `definitions`) should be
	 * shown in the sidebar, search and content.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__hidemodels}
	 */
	hideModels?: boolean;
	/**
	 * Whether to show the sidebar search bar.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__hidesearch}
	 */
	hideSearch?: boolean;
	/**
	 * Whether to show the "Test Request" button.
	 *
	 * @default false
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__hidetestrequestbutton}
	 */
	hideTestRequestButton?: boolean;
	/**
	 * We're generating code examples for a long list of popular HTTP clients.
	 * You can control which are shown by passing an array of clients, to hide
	 * the given clients.
	 *
	 * @example
	 * Pass an empty array [] to show all available clients:
	 * ```ts
	 * {
	 * 	hiddenClients: [],
	 * }
	 * ```
	 *
	 * Pass an array of individual clients to hide just those clients:
	 * ```ts
	 * {
	 * 	hiddenClients: ["fetch"],
	 * }
	 * ```
	 *
	 * But you can also pass true to hide all HTTP clients.
	 * ```ts
	 * {
	 * 	hiddenClients: true,
	 * }
	 * ```
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__hiddenclients}
	 */
	hiddenClients?: boolean | ScalarHttpClient[];
	/**
	 * The layout style to use for the API reference.
	 *
	 * @default "modern"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__layout}
	 */
	layout?: "modern" | "classic";
	/**
	 * You can pass information to the config object to configure meta information out of the box.
	 *
	 * @example
	 * ```ts
	 * {
	 * 	metaData: {
	 * 		title: "Page title",
	 * 		description: "My page description",
	 * 		ogDescription: "Still about my page",
	 * 		ogTitle: "Page title",
	 * 		ogImage: "https://example.com/image.png",
	 * 		twitterCard: "summary_large_image",
	 * 		// and more...
	 * 	},
	 * }
	 * ```
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__metadata}
	 */
	metaData?: Record<string, any>;
	/**
	 * Whether the sidebar display text and search should use the operation summary or the operation path.
	 *
	 * @default "summary"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__operationtitlesource}
	 */
	operationTitleSource?: "summary" | "path";
	/**
	 * Whether to order required properties first in schema objects. When enabled, required properties will be displayed before optional properties in model definitions.
	 *
	 * @default true
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__orderrequiredpropertiesfirst}
	 */
	orderRequiredPropertiesFirst?: boolean;
	/**
	 * Control how schema properties are ordered in model definitions. Can be set to:
	 *
	 * - 'alpha': Sort properties alphabetically by name
	 * - 'preserve': Preserve the order from the OpenAPI Document
	 *
	 * @default "alpha"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__orderschemapropertiesby}
	 */
	orderSchemaPropertiesBy?: "alpha" | "preserve";
	/**
	 * Making requests to other domains is restricted in the browser and requires
	 * {@link https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS|CORS headers}.
	 * It's recommended to use a proxy to send requests to other origins.
	 *
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__proxyurl}
	 */
	proxyUrl?: string;
	/**
	 * Key used with CTRL/CMD to open the search modal.
	 *
	 * @default "k"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__searchhotkey}
	 */
	searchHotKey?: string;
	/**
	 * Whether the sidebar should be shown.
	 *
	 * @default true
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__showsidebar}
	 */
	showSidebar?: boolean;
	/**
	 * Sets the visibility the developer tools, by default only shows on localhost or similar hosts.
	 *
	 * @default "localhost"
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__showtoolbar}
	 */
	showToolbar?: "always" | "localhost" | "never";
	/**
	 * By default we're using Inter and JetBrains Mono, served from Scalar's fonts CDN at `https://fonts.scalar.com`. If you use a different font or just don't want to load web fonts, pass `withDefaultFonts: false` to the configuration.
	 *
	 * @default true
	 * @see {@link https://guides.scalar.com/scalar/scalar-api-references/configuration#configuration__configuration-options__showoperationid__withdefaultfonts}
	 */
	withDefaultFonts?: boolean;
}

export interface OpenAPIOptions extends OpenAPIScalarOptions {
	/**
	 * The path to the OpenAPI reference page
	 *
	 * keep in mind that this path will be appended to the base URL `/api/auth` path
	 * by default, so if you set this to `/reference`, the full path will be `/api/auth/reference`
	 *
	 * @default "/reference"
	 */
	path?: LiteralString;
	/**
	 * Disable the default reference page that is generated by Scalar
	 *
	 * @default false
	 */
	disableDefaultReference?: boolean;
}

export const openAPI = <O extends OpenAPIOptions>(options?: O) => {
	const path = (options?.path ?? "/reference") as "/reference";
	return {
		id: "open-api",
		endpoints: {
			generateOpenAPISchema: createAuthEndpoint(
				"/open-api/generate-schema",
				{
					method: "GET",
				},
				async (ctx) => {
					const schema = await generator(ctx.context, ctx.context.options);
					return ctx.json(schema);
				},
			),
			openAPIReference: createAuthEndpoint(
				path,
				{
					method: "GET",
					metadata: {
						isAction: false,
					},
				},
				async (ctx) => {
					if (options?.disableDefaultReference) {
						throw new APIError("NOT_FOUND");
					}
					const schema = await generator(ctx.context, ctx.context.options);
					return new Response(getHTML(schema, options), {
						headers: {
							"Content-Type": "text/html",
						},
					});
				},
			),
		},
	} satisfies BetterAuthPlugin;
};

export type * from "./generator";
