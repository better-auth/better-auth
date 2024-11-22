import React from "react";
import { Highlight, HighlightProps, themes } from "prism-react-renderer";
import theme from "./theme";

interface CodeEditorProps {
	code: string;
	language: string;
}

export function CodeEditor({ code, language }: CodeEditorProps) {
	return (
		<Highlight theme={theme} code={code} language={language}>
			{({ className, style, tokens, getLineProps, getTokenProps }) => (
				<pre
					className={className}
					style={{
						...style,
						padding: "1rem",
						overflow: "auto",
						maxHeight: "400px",
					}}
				>
					{tokens.map((line, i) => (
						<div key={i} {...getLineProps({ line, key: i })}>
							<span className="mr-4 text-gray-500">{i + 1}</span>
							{line.map((token, key) => (
								<span
									key={key}
									{...getTokenProps({ token, key, className: "text-sm" })}
								/>
							))}
						</div>
					))}
				</pre>
			)}
		</Highlight>
	);
}
