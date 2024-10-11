"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import { ReactNode } from "react";

export default ({ children }: { children: ReactNode }) => (
  <LazyMotion features={domAnimation}>{children}</LazyMotion>
);
