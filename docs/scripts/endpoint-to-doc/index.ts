import fs from "node:fs";
import path from "node:path";
import type { createAuthEndpoint as BAcreateAuthEndpoint } from "better-auth/api";
import * as z from "zod/v3";

playSound("Hero");

let isUsingSessionMiddleware = false;

export const {
	orgMiddleware,
	orgSessionMiddleware,
	requestOnlySessionMiddleware,
	sessionMiddleware,
	originCheck,
	adminMiddleware,
	referenceMiddleware,
} = {
	orgMiddleware: () => {},
	referenceMiddleware: (cb: (x: any) => void) => () => {},
	orgSessionMiddleware: () => {},
	requestOnlySessionMiddleware: () => {},
	sessionMiddleware: () => {
		isUsingSessionMiddleware = true;
	},
	originCheck: (cb: (x: any) => void) => () => {},
	adminMiddleware: () => {
		isUsingSessionMiddleware = true;
	},
};

const file = path.join(process.cwd(), "./scripts/endpoint-to-doc/input.ts");

function clearImportCache() {
	const resolved = new URL(file, import.meta.url).pathname;
	delete (globalThis as any).__dynamicImportCache?.[resolved];
	delete require.cache[require.resolve(resolved)];
}

console.log(`Watching: ${file}`);

fs.watch(file, async () => {
	isUsingSessionMiddleware = false;
	playSound();
	console.log(`Detected file change. Regenerating mdx.`);
	const inputCode = fs.readFileSync(file, "utf-8");
	if (inputCode.includes(".coerce"))
		fs.writeFileSync(file, inputCode.replaceAll(".coerce", ""), "utf-8");
	await generateMDX();
	playSound("Hero");
});

async function generateMDX() {
	const exports = await import("./input");
	clearImportCache();
	if (Object.keys(exports).length !== 1)
		return console.error(`Please provide at least 1 export.`);
	const start = Date.now();
	const functionName = Object.keys(exports)[0]! as string;

	const [path, options]: [string, Options] =
		//@ts-expect-error
		await exports[Object.keys(exports)[0]!];
	if (!path || !options) return console.error(`No path or options.`);

	if (options.use) {
		options.use.forEach((fn) => fn());
	}

	console.log(`function name:`, functionName);

	let jsdoc = generateJSDoc({
		path,
		functionName,
		options,
		isServerOnly: options.metadata?.SERVER_ONLY ?? false,
	});

	let mdx = `<APIMethod${parseParams(path, options)}>\n\`\`\`ts\n${parseType(
		functionName,
		options,
	)}\n\`\`\`\n</APIMethod>`;

	console.log(`Generated in ${(Date.now() - start).toFixed(2)}ms!`);
	fs.writeFileSync(
		"./scripts/endpoint-to-doc/output.mdx",
		`${APIMethodsHeader}\n\n${mdx}\n\n${JSDocHeader}\n\n${jsdoc}`,
		"utf-8",
	);
	console.log(`Successfully updated \`output.mdx\`!`);
}

type CreateAuthEndpointProps = Parameters<typeof BAcreateAuthEndpoint>;

type Options = CreateAuthEndpointProps[1];

const APIMethodsHeader = `{/* -------------------------------------------------------- */}
{/*                   APIMethod component                    */}
{/* -------------------------------------------------------- */}`;

const JSDocHeader = `{/* -------------------------------------------------------- */}
{/*                JSDOC For the endpoint                    */}
{/* -------------------------------------------------------- */}`;

export const createAuthEndpoint = async (
	...params: Partial<CreateAuthEndpointProps>
) => {
	const [path, options] = params;
	if (!path || !options) return console.error(`No path or options.`);

	return [path, options];
};

type Body = {
	propName: string;
	type: string[];
	isOptional: boolean;
	isServerOnly: boolean;
	jsDocComment: string | null;
	path: string[];
	example: string | undefined;
};

function parseType(functionName: string, options: Options) {
	const body: z.ZodAny = (options.query ?? options.body) as any;

	const parsedBody: Body[] = parseZodShape(body, []);

	// console.log(parsedBody);

	let strBody: string = convertBodyToString(parsedBody);

	return `type ${functionName} = {\n${strBody}}`;
}

function convertBodyToString(parsedBody: Body[]) {
	let strBody: string = ``;
	const indentationSpaces = `    `;

	let i = -1;
	for (const body of parsedBody) {
		i++;
		if (body.jsDocComment || body.isServerOnly) {
			strBody += `${indentationSpaces.repeat(
				1 + body.path.length,
			)}/**\n${indentationSpaces.repeat(1 + body.path.length)} * ${
				body.jsDocComment
			} ${
				body.isServerOnly
					? `\n${indentationSpaces.repeat(1 + body.path.length)} * @serverOnly`
					: ""
			}\n${indentationSpaces.repeat(1 + body.path.length)} */\n`;
		}

		if (body.type[0] === "Object") {
			strBody += `${indentationSpaces.repeat(1 + body.path.length)}${
				body.propName
			}${body.isOptional ? "?" : ""}: {\n`;
		} else {
			strBody += `${indentationSpaces.repeat(1 + body.path.length)}${
				body.propName
			}${body.isOptional ? "?" : ""}: ${body.type.join(" | ")}${
				typeof body.example !== "undefined" ? ` = ${body.example}` : ""
			}\n`;
		}

		if (
			!parsedBody[i + 1] ||
			parsedBody[i + 1].path.length < body.path.length
		) {
			let diff = body.path.length - (parsedBody[i + 1]?.path?.length || 0);
			for (const index of Array(diff)
				.fill(0)
				.map((_, i) => i)
				.reverse()) {
				strBody += `${indentationSpaces.repeat(index + 1)}}\n`;
			}
		}
	}

	return strBody;
}

function parseZodShape(zod: z.ZodAny, path: string[]) {
	const parsedBody: Body[] = [];

	if (!zod || !zod._def) {
		return parsedBody;
	}

	let isRootOptional = undefined;
	let shape = z.object(
		{ test: z.string({ description: "" }) },
		{ description: "some descriptiom" },
	).shape;

	//@ts-expect-error
	if (zod._def.typeName === "ZodOptional") {
		isRootOptional = true;
		const eg = z.optional(z.object({}));
		const x = zod as never as typeof eg;
		//@ts-expect-error
		shape = x._def.innerType.shape;
	} else {
		const eg = z.object({});
		const x = zod as never as typeof eg;
		//@ts-expect-error
		shape = x.shape;
	}

	for (const [key, value] of Object.entries(shape)) {
		if (!value) continue;
		let description = value.description;
		let { type, isOptional, defaultValue } = getType(value as any, {
			forceOptional: isRootOptional,
		});

		let example = description ? description.split(" Eg: ")[1] : undefined;
		if (example) description = description?.replace(" Eg: " + example, "");

		let isServerOnly = description
			? description.includes("server-only.")
			: false;
		if (isServerOnly) description = description?.replace(" server-only. ", "");

		if (!description?.trim().length) description = undefined;

		parsedBody.push({
			propName: key,
			isOptional: isOptional,
			jsDocComment: description ?? null,
			path,
			isServerOnly,
			type,
			example: example ?? defaultValue ?? undefined,
		});

		if (type[0] === "Object") {
			const v = value as never as z.ZodAny;
			parsedBody.push(...parseZodShape(v, [...path, key]));
		}
	}
	return parsedBody;
}

function getType(
	value: z.ZodAny,
	{
		forceNullable,
		forceOptional,
		forceDefaultValue,
	}: {
		forceOptional?: boolean;
		forceNullable?: boolean;
		forceDefaultValue?: string;
	} = {},
): { type: string[]; isOptional: boolean; defaultValue?: string } {
	if (!value._def) {
		console.error(
			`Something went wrong during "getType". value._def isn't defined.`,
		);
		console.error(`value:`);
		console.log(value);
		process.exit(1);
	}
	const _null: string[] = value?.isNullable() ? ["null"] : [];
	switch (value._def.typeName as string) {
		case "ZodString": {
			return {
				type: ["string", ..._null],
				isOptional: forceOptional ?? value.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodObject": {
			return {
				type: ["Object", ..._null],
				isOptional: forceOptional ?? value.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodBoolean": {
			return {
				type: ["boolean", ..._null],
				isOptional: forceOptional ?? value.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodDate": {
			return {
				type: ["date", ..._null],
				isOptional: forceOptional ?? value.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodEnum": {
			const v = value as never as z.ZodEnum<["hello", "world"]>;
			const types: string[] = [];
			for (const value of v._def.values) {
				types.push(JSON.stringify(value));
			}
			return {
				type: types,
				isOptional: forceOptional ?? v.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodOptional": {
			const v = value as never as z.ZodOptional<z.ZodAny>;
			const r = getType(v._def.innerType, {
				forceOptional: true,
				forceNullable: forceNullable,
			});
			return {
				type: r.type,
				isOptional: forceOptional ?? r.isOptional,
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodDefault": {
			const v = value as never as z.ZodDefault<z.ZodAny>;
			const r = getType(v._def.innerType, {
				forceOptional: forceOptional,
				forceDefaultValue: JSON.stringify(v._def.defaultValue()),
				forceNullable: forceNullable,
			});
			return {
				type: r.type,
				isOptional: forceOptional ?? r.isOptional,
				defaultValue: forceDefaultValue ?? r.defaultValue,
			};
		}
		case "ZodAny": {
			return {
				type: ["any", ..._null],
				isOptional: forceOptional ?? value.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodRecord": {
			const v = value as never as z.ZodRecord;
			const keys: string[] = getType(v._def.keyType as any).type;
			const values: string[] = getType(v._def.valueType as any).type;
			return {
				type: keys.map((key, i) => `Record<${key}, ${values[i]}>`),
				isOptional: forceOptional ?? v.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodNumber": {
			return {
				type: ["number", ..._null],
				isOptional: forceOptional ?? value.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodUnion": {
			const v = value as never as z.ZodUnion<[z.ZodAny]>;
			const types: string[] = [];
			for (const option of v.options) {
				const t = getType(option as any).type;
				types.push(t.length === 0 ? t[0] : `${t.join(" | ")}`);
			}
			return {
				type: types,
				isOptional: forceOptional ?? v.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}
		case "ZodNullable": {
			const v = value as never as z.ZodNullable<z.ZodAny>;
			const r = getType(v._def.innerType, { forceOptional: true });
			return {
				type: r.type,
				isOptional: forceOptional ?? r.isOptional,
				defaultValue: forceDefaultValue,
			};
		}

		case "ZodArray": {
			const v = value as never as z.ZodArray<z.ZodAny>;
			const types = getType(v._def.type as any);
			return {
				type: [
					`${
						types.type.length === 1
							? types.type[0]
							: `(${types.type.join(" | ")})`
					}[]`,
					..._null,
				],
				isOptional: forceOptional ?? v.isOptional(),
				defaultValue: forceDefaultValue,
			};
		}

		default: {
			console.error(`Unknown Zod type: ${value._def.typeName}`);
			console.log(value._def);
			process.exit(1);
		}
	}
}

function parseParams(path: string, options: Options): string {
	let params: string[] = [];
	params.push(`path="${path}"`);
	params.push(`method="${options.method}"`);

	if (options.requireHeaders || isUsingSessionMiddleware)
		params.push("requireSession");
	if (options.metadata?.SERVER_ONLY) params.push("isServerOnly");
	if (options.method === "GET" && options.body) params.push("forceAsBody");
	if (options.method === "POST" && options.query) params.push("forceAsQuery");

	if (params.length === 2) return " " + params.join(" ");
	return "\n  " + params.join("\n  ") + "\n";
}

function generateJSDoc({
	path,
	options,
	functionName,
	isServerOnly,
}: {
	path: string;
	options: Options;
	functionName: string;
	isServerOnly: boolean;
}) {
	/**
	 * ### Endpoint
	 *
	 * POST `/organization/set-active`
	 *
	 * ### API Methods
	 *
	 * **server:**
	 * `auth.api.setActiveOrganization`
	 *
	 * **client:**
	 * `authClient.organization.setActive`
	 *
	 * @see [Read our docs to learn more.](https://better-auth.com/docs/plugins/organization#api-method-organization-set-active)
	 */

	let jsdoc: string[] = [];
	jsdoc.push(`### Endpoint`);
	jsdoc.push(``);
	jsdoc.push(`${options.method} \`${path}\``);
	jsdoc.push(``);
	jsdoc.push(`### API Methods`);
	jsdoc.push(``);
	jsdoc.push(`**server:**`);
	jsdoc.push(`\`auth.api.${functionName}\``);
	jsdoc.push(``);
	if (!isServerOnly) {
		jsdoc.push(`**client:**`);
		jsdoc.push(`\`authClient.${pathToDotNotation(path)}\``);
		jsdoc.push(``);
	}
	jsdoc.push(
		`@see [Read our docs to learn more.](https://better-auth.com/docs/plugins/${
			path.split("/")[1]
		}#api-method${path.replaceAll("/", "-")})`,
	);

	return `/**\n * ${jsdoc.join("\n * ")}\n */`;
}

function pathToDotNotation(input: string): string {
	return input
		.split("/") // split into segments
		.filter(Boolean) // remove empty strings (from leading '/')
		.map((segment) =>
			segment
				.split("-") // split kebab-case
				.map((word, i) =>
					i === 0
						? word.toLowerCase()
						: word.charAt(0).toUpperCase() + word.slice(1),
				)
				.join(""),
		)
		.join(".");
}

function playSound(name: string = "Ping") {
	const path = `/System/Library/Sounds/${name}.aiff`;
	void Bun.$`afplay ${path}`;
}
