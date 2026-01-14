import { useAtom } from "jotai";
import { js_beautify } from "js-beautify";
import { useMemo, useState } from "react";
import { optionsAtom } from "../store";
import { CodeEditor } from "./code-editor";
import { resolveNextJSFiles } from "./frameworks/nextjs";
import { resolveNuxtFiles } from "./frameworks/nuxt";
import { TabBar } from "./tab-bar";

export default function CodeTabs({ framework }: { framework: string }) {
	const [options] = useAtom(optionsAtom);

	const files = useMemo(() => {
		switch (framework) {
			case "nextjs":
				return resolveNextJSFiles(options);
			case "nuxt":
				return resolveNuxtFiles(options);
			case "svelte-kit":
				break;
			case "solid-start":
				break;
		}

		console.error("Invalid framework", framework);
		return [];
	}, [framework, options]);

	const [activeFileId, setActiveFileId] = useState(files[0].id);

	const handleTabClick = (fileId: string) => {
		setActiveFileId(fileId);
	};

	const handleTabClose = (fileId: string) => {
		if (activeFileId === fileId) {
			setActiveFileId(files[0].id);
		}
	};

	const activeFile = files.find((file) => file.id === activeFileId);

	return (
		<div className="w-full mr-auto max-w-[60.65rem] mt-8 border border-border rounded-md overflow-hidden">
			<TabBar
				files={files}
				activeFileId={activeFileId}
				onTabClick={handleTabClick}
				onTabClose={handleTabClose}
			/>
			<div className="">
				{activeFile && (
					<CodeEditor
						language={activeFile.name.endsWith(".tsx") ? "tsx" : "typescript"}
						code={
							activeFile.name.endsWith(".ts")
								? js_beautify(activeFile.content)
								: activeFile.content.replace(/\n{3,}/g, "\n\n")
						}
					/>
				)}
			</div>
		</div>
	);
}
