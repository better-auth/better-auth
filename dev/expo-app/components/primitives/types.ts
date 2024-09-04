import type { Pressable, Text, View, ViewStyle } from "react-native";

type ComponentPropsWithAsChild<T extends React.ElementType<any>> =
  React.ComponentPropsWithoutRef<T> & { asChild?: boolean };

type ViewRef = React.ElementRef<typeof View>;
type PressableRef = React.ElementRef<typeof Pressable>;
type TextRef = React.ElementRef<typeof Text>;

type SlottableViewProps = ComponentPropsWithAsChild<typeof View>;
type SlottablePressableProps = ComponentPropsWithAsChild<typeof Pressable> & {
  /**
   * Platform: WEB ONLY
   */
  onKeyDown?: (ev: React.KeyboardEvent) => void;
  /**
   * Platform: WEB ONLY
   */
  onKeyUp?: (ev: React.KeyboardEvent) => void;
};
type SlottableTextProps = ComponentPropsWithAsChild<typeof Text>;

interface Insets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

type PointerDownOutsideEvent = CustomEvent<{ originalEvent: PointerEvent }>;
type FocusOutsideEvent = CustomEvent<{ originalEvent: FocusEvent }>;

/**
 * Certain props are only available on the native version of the component.
 * @docs For the web version, see the Radix documentation https://www.radix-ui.com/primitives
 */
interface PositionedContentProps {
  forceMount?: true | undefined;
  style?: ViewStyle;
  alignOffset?: number;
  insets?: Insets;
  avoidCollisions?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  sideOffset?: number;
  /**
   * Platform: NATIVE ONLY
   */
  disablePositioningStyle?: boolean;
  /**
   * Platform: WEB ONLY
   */
  loop?: boolean;
  /**
   * Platform: WEB ONLY
   */
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Platform: WEB ONLY
   */
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  /**
   * Platform: WEB ONLY
   */
  onPointerDownOutside?: (event: PointerDownOutsideEvent) => void;
  /**
   * Platform: WEB ONLY
   */
  onFocusOutside?: (event: FocusOutsideEvent) => void;
  /**
   * Platform: WEB ONLY
   */
  onInteractOutside?: (
    event: PointerDownOutsideEvent | FocusOutsideEvent,
  ) => void;
  /**
   * Platform: WEB ONLY
   */
  collisionBoundary?: Element | null | Array<Element | null>;
  /**
   * Platform: WEB ONLY
   */
  sticky?: "partial" | "always";
  /**
   * Platform: WEB ONLY
   */
  hideWhenDetached?: boolean;
}

interface ForceMountable {
  forceMount?: true | undefined;
}

export type {
  ComponentPropsWithAsChild,
  ForceMountable,
  Insets,
  PositionedContentProps,
  PressableRef,
  SlottablePressableProps,
  SlottableTextProps,
  SlottableViewProps,
  TextRef,
  ViewRef,
};
