import * as React from "react";
import {type GestureResponderEvent, Pressable, View} from "react-native";
import * as Slot from "@/components/primitives/slot";
import type {
  PressableRef,
  SlottablePressableProps,
  SlottableViewProps,
  ViewRef,
} from "@/components/primitives/types";
import {ToggleGroupUtils} from "@/components/primitives/utils";
import type {ToggleGroupItemProps, ToggleGroupRootProps} from "./types";

const ToggleGroupContext = React.createContext<ToggleGroupRootProps | null>(
  null,
);

const Root = React.forwardRef<
  ViewRef,
  SlottableViewProps & ToggleGroupRootProps
>(
  (
    {
      asChild,
      type,
      value,
      onValueChange,
      disabled = false,
      rovingFocus: _rovingFocus,
      orientation: _orientation,
      dir: _dir,
      loop: _loop,
      ...viewProps
    },
    ref,
  ) => {
    const Component = asChild ? Slot.View : View;
    return (
      <ToggleGroupContext.Provider
        value={
          {
            type,
            value,
            disabled,
            onValueChange,
          } as ToggleGroupRootProps
        }
      >
        <Component ref={ref} role="group" {...viewProps} />
      </ToggleGroupContext.Provider>
    );
  },
);

Root.displayName = "RootToggleGroup";

function useRootContext() {
  const context = React.useContext(ToggleGroupContext);
  if (!context) {
    throw new Error(
      "ToggleGroup compound components cannot be rendered outside the ToggleGroup component",
    );
  }
  return context;
}

const ItemContext = React.createContext<ToggleGroupItemProps | null>(null);

const Item = React.forwardRef<
  PressableRef,
  SlottablePressableProps & ToggleGroupItemProps
>(
  (
    {
      asChild,
      value: itemValue,
      disabled: disabledProp = false,
      onPress: onPressProp,
      ...props
    },
    ref,
  ) => {
    const id = React.useId();
    const {type, disabled, value, onValueChange} = useRootContext();

    function onPress(ev: GestureResponderEvent) {
      if (disabled || disabledProp) return;
      if (type === "single") {
        onValueChange(ToggleGroupUtils.getNewSingleValue(value, itemValue));
      }
      if (type === "multiple") {
        onValueChange(ToggleGroupUtils.getNewMultipleValue(value, itemValue));
      }
      onPressProp?.(ev);
    }

    const isChecked =
      type === "single"
        ? ToggleGroupUtils.getIsSelected(value, itemValue)
        : undefined;
    const isSelected =
      type === "multiple"
        ? ToggleGroupUtils.getIsSelected(value, itemValue)
        : undefined;

    const Component = asChild ? Slot.Pressable : Pressable;
    return (
      <ItemContext.Provider value={{value: itemValue}}>
        <Component
          ref={ref}
          key={`${ id }-item-${ value }`}
          aria-disabled={disabled}
          role={type === "single" ? "radio" : "checkbox"}
          onPress={onPress}
          aria-checked={isChecked}
          aria-selected={isSelected}
          disabled={(disabled || disabledProp) ?? false}
          accessibilityState={{
            disabled: (disabled || disabledProp) ?? false,
            checked: isChecked,
            selected: isSelected,
          }}
          {...props}
        />
      </ItemContext.Provider>
    );
  },
);

Item.displayName = "ItemToggleGroup";

function useItemContext() {
  const context = React.useContext(ItemContext);
  if (!context) {
    throw new Error(
      "ToggleGroupItem compound components cannot be rendered outside the ToggleGroupItem component",
    );
  }
  return context;
}

const utils = ToggleGroupUtils;

export {Item, Root, useItemContext, useRootContext, utils};
