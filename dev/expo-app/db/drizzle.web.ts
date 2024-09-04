import { type SQLJsDatabase, drizzle } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import { useDatabase } from "./provider";
import { useEffect, useReducer } from "react";
import { habitTable } from "./schema";

export const initialize = async (): Promise<SQLJsDatabase> => {
  const sqlPromise = initSqlJs({
    locateFile: (file) => `https://sql.js.org/dist/${file}`,
  });
  const dataPromise = fetch("/database.sqlite").then((res) =>
    res.arrayBuffer(),
  );
  const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
  const sqldb = new SQL.Database(new Uint8Array(buf));
  const db = drizzle(sqldb);
  return db;
};

interface State {
  success: boolean;
  error?: Error;
}

type Action =
  | { type: "migrating" }
  | { type: "migrated"; payload: true }
  | { type: "error"; payload: Error };

export const useMigrationHelper = (): State => {
  const { db } = useDatabase();

  const initialState: State = {
    success: false,
    error: undefined,
  };

  const fetchReducer = (state: State, action: Action): State => {
    switch (action.type) {
      case "migrating": {
        return { ...initialState };
      }
      case "migrated": {
        return { ...initialState, success: action.payload };
      }
      case "error": {
        return { ...initialState, error: action.payload };
      }
      default: {
        return state;
      }
    }
  };

  const [state, dispatch] = useReducer(fetchReducer, initialState);

  useEffect(() => {
    if (!db) {
      return dispatch({ type: "migrating" });
    }
    dispatch({ type: "migrated", payload: true });
  }, [db]);

  return state;
};
