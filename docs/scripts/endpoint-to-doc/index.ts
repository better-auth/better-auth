import readline from "readline";
import type { createAuthEndpoint as BAcreateAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import fs from "fs";

type CreateAuthEndpointProps = Parameters<typeof BAcreateAuthEndpoint>;

type Options = CreateAuthEndpointProps[1];

const APIMethodsHeader = `{/* -------------------------------------------------------- */}
{/*                   APIMethod component                    */}
{/* -------------------------------------------------------- */}`

const JSDocHeader = `{/* -------------------------------------------------------- */}
{/*                JSDOC For the endpoint                    */}
{/* -------------------------------------------------------- */}`

export const createAuthEndpoint = async (
	...params: Partial<CreateAuthEndpointProps>
) => {
	const [path, options] = params;
	if (!path || !options) return console.error(`No path or options.`);

	const functionName = await askQuestion(
		"What's the function name for this endpoint? ",
	);

	console.log(`function name:`, functionName);

	let jsdoc = generateJSDoc({ path, functionName, options });

	let mdx = `<APIMethod${parseParams(path, options)}>\n\`\`\`ts\n${parseType(
		functionName,
		options,
	)}\n\`\`\`\n</APIMethod>`;
	console.log(`\n---------------\n${mdx}\n---------------\n\n`);
	console.log();
	console.log(`\n---------------\n${jsdoc}\n---------------\n\n`);
	fs.writeFileSync(
		"./scripts/endpoint-to-doc/output.mdx",
		`${APIMethodsHeader}\n\n${mdx}\n\n${JSDocHeader}\n\n${jsdoc}`,
		"utf-8",
	);
	console.log(`Successfully updated \`output.mdx\`!`);
};

type Body = {
	propName: string;
	type: string;
	isOptional: boolean;
	isServerOnly: boolean;
	jsDocComment: string | null;
	path: string[];
	example: string | null;
};

function parseType(functionName: string, options: Options) {
	const body: z.ZodAny = (
		options.method === "GET" ? options.query : options.body
	) as any;

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

		if (body.type === "Object") {
			strBody += `${indentationSpaces.repeat(1 + body.path.length)}${
				body.propName
			}${body.isOptional ? "?" : ""}: {\n`;
		} else {
			strBody += `${indentationSpaces.repeat(1 + body.path.length)}${
				body.propName
			}${body.isOptional ? "?" : ""}: ${body.type}${
				body.example ? ` = ${body.example}` : ""
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

	let isRootOptional = undefined;
	let shape = z.object(
		{ test: z.string({ description: "" }) },
		{ description: "some descriptiom" },
	).shape;

	//@ts-ignore
	if (zod._def.typeName === "ZodOptional") {
		isRootOptional = true;
		const eg = z.optional(z.object({}));
		const x = zod as never as typeof eg;
		//@ts-ignore
		shape = x._def.innerType.shape;
	} else {
		const eg = z.object({});
		const x = zod as never as typeof eg;
		//@ts-ignore
		shape = x.shape;
	}

	for (const [key, value] of Object.entries(shape)) {
		if (!value) continue;
		let description = value.description;
		let { type, isOptional } = getType(value as any, isRootOptional);

		let example = description ? description.split(" Eg: ")[1] : null;
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
			example,
		});

		if (type === "Object") {
			const v = value as never as z.ZodAny;
			parsedBody.push(...parseZodShape(v, [...path, key]));
		}
	}
	return parsedBody;
}

function getType(
	value: z.ZodAny,
	forceOptional?: boolean,
): { type: string; isOptional: boolean } {
	if(!value._def){
		console.error(`Something went wrong during "getType". value._def isn't defined.`)
		console.error(`value:`);
		console.log(value)
		process.exit(1);
	}
	switch (value._def.typeName as string) {
		case "ZodString": {
			return {
				type: "string",
				isOptional: forceOptional ?? value.isOptional(),
			};
		}
		case "ZodObject": {
			return {
				type: "Object",
				isOptional: forceOptional ?? value.isOptional(),
			};
		}
		case "ZodOptional": {
			const v = value as never as z.ZodOptional<z.ZodAny>;
			const r = getType(v._def.innerType, true);
			return { type: r.type, isOptional: forceOptional ?? r.isOptional };
		}
		case "ZodAny": {
			return { type: "any", isOptional: forceOptional ?? value.isOptional() };
		}
		case "ZodRecord": {
			const v = value as never as z.ZodRecord;
			const key: string = getType(v._def.keyType as any).type;
			const _value: string = getType(v._def.valueType as any).type;
			return {
				type: `Record<${key}, ${_value}>`,
				isOptional: forceOptional ?? v.isOptional(),
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

	if (options.requireHeaders) params.push("requireSession");

	if (params.length === 2) return " " + params.join(" ");
	return "\n  " + params.join("\n  ") + "\n";
}

function askQuestion(question: string): Promise<string> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise<string>((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}

function generateJSDoc({
	path,
	options,
	functionName,
}: { path: string; options: Options; functionName: string }) {
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
	jsdoc.push(`**client:**`);
	jsdoc.push(`\`authClient.${pathToDotNotation(path)}\``);
	jsdoc.push(``);
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
