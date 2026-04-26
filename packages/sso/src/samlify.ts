import samlifyDefault, * as samlifyNamespace from "samlify";

/**
 * CJS `samlify` default is sometimes undefined under ESM due to interop issues (#8697)
 * So we prefer the namespace when it looks complete, else the default binding, else the namespace as fallback.
 */
const namespaceLooksComplete =
	typeof samlifyNamespace.SPMetadata === "function" &&
	typeof samlifyNamespace.setSchemaValidator === "function";

export const saml: typeof samlifyDefault = namespaceLooksComplete
	? (samlifyNamespace as unknown as typeof samlifyDefault)
	: (samlifyDefault ?? (samlifyNamespace as unknown as typeof samlifyDefault));
