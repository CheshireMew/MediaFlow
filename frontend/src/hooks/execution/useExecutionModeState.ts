import { useEffect, useState } from "react";
import type { NullableExecutionMode } from "../../services/domain";
import {
  useRuntimeExecutionStore,
  type RuntimeExecutionScope,
} from "../../stores/runtimeExecutionStore";

export function useExecutionModeState(scope: RuntimeExecutionScope) {
  const setScopeMode = useRuntimeExecutionStore((state) => state.setScopeMode);
  const [executionMode, setExecutionMode] = useState<NullableExecutionMode>(null);

  useEffect(() => {
    setScopeMode(scope, executionMode);
  }, [executionMode, scope, setScopeMode]);

  return {
    executionMode,
    setExecutionMode,
  };
}
