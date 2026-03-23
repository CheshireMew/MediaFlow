import { create } from "zustand";
import type { NullableExecutionMode } from "../services/domain";

export type RuntimeExecutionScope = "transcriber" | "translator";

type RuntimeExecutionState = {
  scopes: Partial<Record<RuntimeExecutionScope, NullableExecutionMode>>;
  setScopeMode: (scope: RuntimeExecutionScope, mode: NullableExecutionMode) => void;
};

export const useRuntimeExecutionStore = create<RuntimeExecutionState>((set) => ({
  scopes: {},
  setScopeMode: (scope, mode) =>
    set((state) => ({
      scopes: {
        ...state.scopes,
        [scope]: mode,
      },
    })),
}));
