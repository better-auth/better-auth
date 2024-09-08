import { useColorScheme as useNativewindColorScheme } from "nativewind";

export function useColorScheme() {
	const { colorScheme, setColorScheme, toggleColorScheme } =
		useNativewindColorScheme();
	return {
		colorScheme: colorScheme ?? "dark",
		isDarkColorScheme: colorScheme === "dark",
		setColorScheme,
		toggleColorScheme,
	};
}
