import { Toaster as Sonner } from "solid-sonner";

export const Toaster = (props: Parameters<typeof Sonner>[0]) => {
	return (
		<Sonner
			class="toaster group"
			toastOptions={{
				classes: {
					toast:
						"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
					description: "group-[.toast]:text-muted-foreground",
					actionButton:
						"group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
					cancelButton:
						"group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
				},
			}}
			{...props}
		/>
	);
};
