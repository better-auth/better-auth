"use client";

import { useState } from "react";
import { Highlight } from "prism-react-renderer";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import theme from "./theme";

interface CodeEditorProps {
	code: string;
	language: string;
}

export function CodeEditor({ code, language }: CodeEditorProps) {
	const [isCopied, setIsCopied] = useState(false);

	const copyToClipboard = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setIsCopied(true);
			setTimeout(() => setIsCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy text: ", err);
		}
	};

	return (
		<div className="relative w-full">
			<Highlight theme={theme} code={code} language={language}>
				{({ className, style, tokens, getLineProps, getTokenProps }) => (
					<pre
						className={`${className} text-sm p-4 w-fit overflow-scroll  max-h-[400px] rounded-md`}
						style={style}
					>
						{tokens.map((line, i) => {
							const lineProps = getLineProps({ line, key: i });
							return (
								<div
									key={i}
									className={lineProps.className}
									style={lineProps.style}
								>
									<span className="inline-block w-4 mr-3 text-gray-500 select-none">
										{i + 1}
									</span>
									{line.map((token, key) => {
										const tokenProps = getTokenProps({ token, key });
										return (
											<span
												key={key}
												className={tokenProps.className}
												style={tokenProps.style}
											>
												{tokenProps.children}
											</span>
										);
									})}
								</div>
							);
						})}
					</pre>
				)}
			</Highlight>
			<Button
				variant="outline"
				size="icon"
				className="absolute top-2 right-2"
				onClick={copyToClipboard}
				aria-label="Copy code"
			>
				{isCopied ? (
					<Check className="h-4 w-4" />
				) : (
					<Copy className="h-4 w-4" />
				)}
			</Button>
		</div>
	);
}
