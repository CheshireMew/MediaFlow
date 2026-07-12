import { createContext, useContext } from "react";

export type ConfirmationOptions = {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

export type ConfirmAction = (options: ConfirmationOptions) => Promise<boolean>;

export const ConfirmationContext = createContext<ConfirmAction | null>(null);

export function useConfirmation() {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) {
    throw new Error("useConfirmation must be used within ConfirmationProvider");
  }
  return confirm;
}
