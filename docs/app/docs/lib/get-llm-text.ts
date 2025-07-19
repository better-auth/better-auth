import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { fileGenerator, remarkDocGen, remarkInstall } from "fumadocs-docgen";
import remarkStringify from "remark-stringify";
import remarkMdx from "remark-mdx";
import { remarkAutoTypeTable } from "fumadocs-typescript";
import { remarkInclude } from "fumadocs-mdx/config";
import { readFile } from "fs/promises";

const processor = remark()
	.use(remarkMdx)
	.use(remarkInclude)
	.use(remarkGfm)
	.use(remarkAutoTypeTable)
	.use(remarkDocGen, { generators: [fileGenerator()] })
	.use(remarkInstall)
	.use(remarkStringify);

export async function getLLMText(docPage: any) {
	const category = [docPage.slugs[0]];

	// Read the raw file content
	const rawContent = await readFile(docPage.data._file.absolutePath, "utf-8");

	const processed = await processor.process({
		path: docPage.data._file.absolutePath,
		value: rawContent,
	});

	return `# ${category}: ${docPage.data.title}
URL: ${docPage.url}
Source: https://raw.githubusercontent.com/better-auth/better-auth/refs/heads/main/docs/content/docs/${
		docPage.file.path
	}

${docPage.data.description}
        
${processed.toString()}
`;
}
