const stripQuery = (value: string) => value.split("?")[0] || value;

const escapeRegex = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const routeToRegex = (route: string) => {
	const normalized = stripQuery(route);
	// Support simple :param segments (e.g. /callback/:id)
	const pattern = escapeRegex(normalized).replace(/\\\/:([^/]+)/g, "/[^/]+");
	// Match route at any path position, but enforce segment boundary after
	return new RegExp(`${pattern}(?:$|[/?])`);
};

export const matchesAnyRoute = (path: string, routes: string[]) => {
	const cleanPath = stripQuery(path);
	return routes.some((route) => routeToRegex(route).test(cleanPath));
};
