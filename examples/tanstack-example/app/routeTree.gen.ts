/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from "./routes/__root";
import { Route as IndexImport } from "./routes/index";
import { Route as AuthTwoFactorImport } from "./routes/auth/two-factor";
import { Route as AuthSignupImport } from "./routes/auth/signup";
import { Route as AuthSigninImport } from "./routes/auth/signin";

// Create/Update Routes

const IndexRoute = IndexImport.update({
	id: "/",
	path: "/",
	getParentRoute: () => rootRoute,
} as any);

const AuthTwoFactorRoute = AuthTwoFactorImport.update({
	id: "/auth/two-factor",
	path: "/auth/two-factor",
	getParentRoute: () => rootRoute,
} as any);

const AuthSignupRoute = AuthSignupImport.update({
	id: "/auth/signup",
	path: "/auth/signup",
	getParentRoute: () => rootRoute,
} as any);

const AuthSigninRoute = AuthSigninImport.update({
	id: "/auth/signin",
	path: "/auth/signin",
	getParentRoute: () => rootRoute,
} as any);

// Populate the FileRoutesByPath interface

declare module "@tanstack/react-router" {
	interface FileRoutesByPath {
		"/": {
			id: "/";
			path: "/";
			fullPath: "/";
			preLoaderRoute: typeof IndexImport;
			parentRoute: typeof rootRoute;
		};
		"/auth/signin": {
			id: "/auth/signin";
			path: "/auth/signin";
			fullPath: "/auth/signin";
			preLoaderRoute: typeof AuthSigninImport;
			parentRoute: typeof rootRoute;
		};
		"/auth/signup": {
			id: "/auth/signup";
			path: "/auth/signup";
			fullPath: "/auth/signup";
			preLoaderRoute: typeof AuthSignupImport;
			parentRoute: typeof rootRoute;
		};
		"/auth/two-factor": {
			id: "/auth/two-factor";
			path: "/auth/two-factor";
			fullPath: "/auth/two-factor";
			preLoaderRoute: typeof AuthTwoFactorImport;
			parentRoute: typeof rootRoute;
		};
	}
}

// Create and export the route tree

export interface FileRoutesByFullPath {
	"/": typeof IndexRoute;
	"/auth/signin": typeof AuthSigninRoute;
	"/auth/signup": typeof AuthSignupRoute;
	"/auth/two-factor": typeof AuthTwoFactorRoute;
}

export interface FileRoutesByTo {
	"/": typeof IndexRoute;
	"/auth/signin": typeof AuthSigninRoute;
	"/auth/signup": typeof AuthSignupRoute;
	"/auth/two-factor": typeof AuthTwoFactorRoute;
}

export interface FileRoutesById {
	__root__: typeof rootRoute;
	"/": typeof IndexRoute;
	"/auth/signin": typeof AuthSigninRoute;
	"/auth/signup": typeof AuthSignupRoute;
	"/auth/two-factor": typeof AuthTwoFactorRoute;
}

export interface FileRouteTypes {
	fileRoutesByFullPath: FileRoutesByFullPath;
	fullPaths: "/" | "/auth/signin" | "/auth/signup" | "/auth/two-factor";
	fileRoutesByTo: FileRoutesByTo;
	to: "/" | "/auth/signin" | "/auth/signup" | "/auth/two-factor";
	id: "__root__" | "/" | "/auth/signin" | "/auth/signup" | "/auth/two-factor";
	fileRoutesById: FileRoutesById;
}

export interface RootRouteChildren {
	IndexRoute: typeof IndexRoute;
	AuthSigninRoute: typeof AuthSigninRoute;
	AuthSignupRoute: typeof AuthSignupRoute;
	AuthTwoFactorRoute: typeof AuthTwoFactorRoute;
}

const rootRouteChildren: RootRouteChildren = {
	IndexRoute: IndexRoute,
	AuthSigninRoute: AuthSigninRoute,
	AuthSignupRoute: AuthSignupRoute,
	AuthTwoFactorRoute: AuthTwoFactorRoute,
};

export const routeTree = rootRoute
	._addFileChildren(rootRouteChildren)
	._addFileTypes<FileRouteTypes>();

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/auth/signin",
        "/auth/signup",
        "/auth/two-factor"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/auth/signin": {
      "filePath": "auth/signin.tsx"
    },
    "/auth/signup": {
      "filePath": "auth/signup.tsx"
    },
    "/auth/two-factor": {
      "filePath": "auth/two-factor.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
