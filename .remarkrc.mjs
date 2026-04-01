import remarkMdx from "remark-mdx";
import remarkPresetLintConsistent from "remark-preset-lint-consistent";
import remarkPresetLintRecommended from "remark-preset-lint-recommended";

export default {
	plugins: [remarkMdx, remarkPresetLintRecommended, remarkPresetLintConsistent],
};
