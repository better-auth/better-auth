declare module "js-beautify" {
	interface JsBeautifyOptions {
		indent_size?: number;
		indent_with_tabs?: boolean;
		brace_style?: string;
		[key: string]: unknown;
	}

	export function js_beautify(
		sourceText: string,
		options?: JsBeautifyOptions,
	): string;
}
