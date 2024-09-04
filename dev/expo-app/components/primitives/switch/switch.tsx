import * as React from "react";
import {type GestureResponderEvent, Pressable, View} from "react-native";
import * as Slot from "@/components/primitives/slot";
import type {
  PressableRef,
  SlottablePressableProps,
  SlottableViewProps,
  ViewRef,
} from "@/components/primitives/types";
import type {SwitchRootProps} from "./types";

const Root = React.forwardRef<
  PressableRef,
  SlottablePressableProps & SwitchRootProps
>(
  (
    {
      asChild,
      checked,
      onCheckedChange,
      disabled,
      onPress: onPressProp,
      "aria-valuetext": ariaValueText,
      ...props
    },
    ref,
  ) => {
    function onPress(ev: GestureResponderEvent) {
      if (disabled) return;
      onCheckedChange(!checked);
      onPressProp?.(ev);
    }

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <Component
        ref={ref}
        aria-disabled={disabled}
        role="switch"
        aria-checked={checked}
        aria-valuetext={ariaValueText ?? checked ? "on" : "off"}
        onPress={onPress}
        accessibilityState={{
          checked,
          disabled,
        }}
        disabled={disabled}
        {...props}
      />
    );
  },
);

Root.displayName = "RootNativeSwitch";

const Thumb = React.forwardRef<ViewRef, SlottableViewProps>(
  ({asChild, ...props}, ref) => {
    const Component = asChild ? Slot.View : View;
    return <Component ref={ref} role="presentation" {...props} />;
  },
);

Thumb.displayName = "ThumbNativeSwitch";

export {Root, Thumb};
