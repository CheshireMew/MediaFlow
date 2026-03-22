import { create } from "zustand";

export type RuntimeExecutionMode = "task_submission" | "direct_result";
export type RuntimeExecutionScope = "transcriber" | "translator";

type RuntimeExecutionState = {
  scopes: Partial<Record<RuntimeExecutionScope, RuntimeExecutionMode | null>>;
  setScopeMode: (scope: RuntimeExecutionScope, mode: RuntimeExecutionMode | null) => void;
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
