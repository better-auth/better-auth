import * as React from "react";

interface AugmentRefProps<T> {
  ref: React.Ref<T>;
  methods?: Record<string, (...args: any[]) => any>;
  deps?: any[];
}

export function useAugmentedRef<T>({
  ref,
  methods,
  deps = [],
}: AugmentRefProps<T>) {
  const augmentedRef = React.useRef<T>(null);
  React.useImperativeHandle(
    ref,
    () => {
      if (typeof augmentedRef === "function" || !augmentedRef?.current) {
        return {} as T;
      }
      return {
        ...augmentedRef.current,
        ...methods,
      };
    },
    deps,
  );
  return augmentedRef;
}
