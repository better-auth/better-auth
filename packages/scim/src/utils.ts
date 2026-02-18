export const getResourceURL = (path: string, baseURL: string) => {
	const normalizedBaseURL = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
	const normalizedPath = path.replace(/^\/+/, "");
	return new URL(normalizedPath, normalizedBaseURL).toString();
};
