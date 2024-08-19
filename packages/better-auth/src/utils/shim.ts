export const shimContext = <T extends Record<string, any>>(
	organizationObject: T,
	newContext: Record<string, any>,
) => {
	const shimmedObj: Record<string, any> = {};
	for (const [key, value] of Object.entries(organizationObject)) {
		shimmedObj[key] = (ctx: Record<string, any>) => {
			return value({
				...ctx,
				context: {
					...newContext,
					...ctx.context,
				},
			});
		};
		shimmedObj[key].path = value.path;
		shimmedObj[key].method = value.method;
		shimmedObj[key].options = value.options;
		shimmedObj[key].headers = value.headers;
	}
	return shimmedObj as T;
};
