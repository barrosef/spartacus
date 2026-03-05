import { createContext, useContext } from "react";
import type { AuthNavigation } from "./types";

export const AuthNavContext = createContext<AuthNavigation | null>(null);

export function useAuthNavigation(): AuthNavigation {
  const ctx = useContext(AuthNavContext);
  if (!ctx) throw new Error("useAuthNavigation must be used within AuthNavigator");
  return ctx;
}
