import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkPresetLintConsistent from "remark-preset-lint-consistent";
import remarkPresetLintRecommended from "remark-preset-lint-recommended";

export default {
	plugins: [
		remarkFrontmatter,
		remarkMdx,
		remarkGfm,
		remarkPresetLintRecommended,
		remarkPresetLintConsistent,
	],
};
