import Conf from "conf";
import type { Options as ConfOptions } from "conf";
import electron from "electron";
import type { Storage } from "./client";
const { app } = electron;

export const storage = (
  opts?: ConfOptions<Record<string, any>> | undefined,
): Storage => {
  if (!app) {
    return {
      getItem: () => null,
      setItem: () => {},
    };
  }

  const config = new Conf({
    cwd: app.getPath("userData"),
    projectName: app.getName(),
    projectVersion: app.getVersion(),
    ...opts,
  });

  return {
    getItem: (key) => {
      return config.get(key, null);
    },
    setItem: (key, value) => {
      config.set(key, value);
    },
  };
};
