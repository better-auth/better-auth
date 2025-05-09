import readline from "readline";
import type { createAuthEndpoint as BAcreateAuthEndpoint } from "better-auth/api";
import { z } from "zod";
import fs from "fs";

type CreateAuthEndpointProps = Parameters<typeof BAcreateAuthEndpoint>;

type Options = CreateAuthEndpointProps[1];

export const createAuthEndpoint = async (
	...params: Partial<CreateAuthEndpointProps>
) => {
	const [path, options] = params;
	if (!path || !options) return;

	const functionName = await askQuestion(
		"What's the function name for this endpoint? ",
	);
	console.log(`function name:`, functionName);
	let mdx = `<APIMethod${parseParams(path, options)}>\n\`\`\`ts\n${parseType(
		functionName,
		options,
	)}\n\`\`\`\n</APIMethod>`;
	console.log(`---------------\n${mdx}`);
	fs.writeFileSync("./scripts/endpoint-to-doc/output.mdx", mdx, "utf-8");
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
	const _ = z.object({ example: z.string() });
	const body = options.body as typeof _;
	const parsedBody: Body[] = parseZodShape(body.shape, []);

	console.log(parsedBody);

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
			)}/*\n${indentationSpaces.repeat(1 + body.path.length)}* ${
				body.jsDocComment
			} ${
				body.isServerOnly
					? `\n${indentationSpaces.repeat(1 + body.path.length)}* @serverOnly`
					: ""
			}\n${indentationSpaces.repeat(1 + body.path.length)}*/\n`;
		}

		if (body.type === "Object") {
			strBody += `${indentationSpaces.repeat(1 + body.path.length)}${
				body.propName
			}${body.isOptional ? "?" : ""}: {\n`;
		} else {
			strBody += `${indentationSpaces.repeat(1 + body.path.length)}${
				body.propName
		}${body.isOptional ? "?" : ""}: ${body.type}${body.example ? ` = ${body.example}` : ""}\n`;
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

function parseZodShape(
	shape: z.ZodObject<
		{ example: z.ZodString },
		"strip",
		z.ZodTypeAny,
		{ example: string },
		{ example: string }
	>["shape"],
	path: string[],
) {
	const parsedBody: Body[] = [];

	for (const [key, value] of Object.entries(shape)) {
		if (!value) continue;
		let description = value.description;
		let { type, isOptional } = getType(value as any);

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
			const v = value as never as z.ZodObject<{ example: z.ZodString }>;
			parsedBody.push(...parseZodShape(v.shape, [...path, key]));
		}
	}
	return parsedBody;
}

function getType(
	value: z.ZodAny,
	forceOptional?: boolean,
): { type: string; isOptional: boolean } {
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
