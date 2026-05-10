import type { SettingsController, SettingsT } from "./settingsTypes";
import { CudaReadinessSetting } from "./general/CudaReadinessSetting";

type CudaReadinessPanelProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function CudaReadinessPanel({ controller, t }: CudaReadinessPanelProps) {
  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <CudaReadinessSetting controller={controller} t={t} />
      </div>
    </div>
  );
}
