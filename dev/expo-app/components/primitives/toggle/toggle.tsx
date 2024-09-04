import * as React from "react";
import {type GestureResponderEvent, Pressable} from "react-native";
import * as Slot from "@/components/primitives/slot";
import type {
  PressableRef,
  SlottablePressableProps,
} from "@/components/primitives/types";
import type {ToggleRootProps} from "./types";

const Root = React.forwardRef<
  PressableRef,
  SlottablePressableProps & ToggleRootProps
>(
  (
    {
      asChild,
      pressed,
      onPressedChange,
      disabled,
      onPress: onPressProp,
      ...props
    },
    ref,
  ) => {
    function onPress(ev: GestureResponderEvent) {
      if (disabled) return;
      const newValue = !pressed;
      onPressedChange(newValue);
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={ref}
        aria-disabled={disabled}
        role="switch"
        aria-selected={pressed}
        onPress={onPress}
        accessibilityState={{
          selected: pressed,
          disabled,
        }}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Root.displayName = "RootNativeToggle";

export {Root};
