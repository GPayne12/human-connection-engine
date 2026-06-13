import { createContext, useContext } from "react";
import type { AppData } from "../hooks/useAppData";

const AppContext = createContext<AppData | null>(null);

export const AppProvider = AppContext.Provider;

export function useApp(): AppData {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
