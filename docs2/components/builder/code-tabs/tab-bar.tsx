import { CodeTab } from "./code-tabs";

interface File {
	id: string;
	name: string;
	content: string;
}

interface TabBarProps {
	files: File[];
	activeFileId: string;
	onTabClick: (fileId: string) => void;
	onTabClose: (fileId: string) => void;
}

export function TabBar({
	files,
	activeFileId,
	onTabClick,
	onTabClose,
}: TabBarProps) {
	return (
		<div className="flex bg-muted border-b border-border">
			{files.map((file) => (
				<CodeTab
					key={file.id}
					fileName={file.name}
					isActive={file.id === activeFileId}
					onClick={() => onTabClick(file.id)}
					onClose={() => onTabClose(file.id)}
				/>
			))}
		</div>
	);
}
