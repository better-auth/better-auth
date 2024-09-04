import type { ViewStyle } from "react-native";

interface LabelRootProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

interface LabelTextProps {
  /**
   * Equivalent to `id` so that the same value can be passed as `aria-labelledby` to the input element.
   */
  nativeID: string;
}

export type { LabelRootProps, LabelTextProps };
