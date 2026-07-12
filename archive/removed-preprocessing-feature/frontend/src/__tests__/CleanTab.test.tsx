/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CleanTab } from "../components/preprocessing/tools/CleanTab";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../components/ui/Select", () => ({
  Select: () => <div data-testid="clean-method-select" />,
}));

describe("CleanTab ROI controls", () => {
  afterEach(cleanup);

  it("shows drawing guidance as status and clears the actual ROI", () => {
    const onClearRoi = vi.fn();
    render(
      <CleanTab
        roi={{ x: 10, y: 20, w: 30, h: 40 }}
        onClearRoi={onClearRoi}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "tools.clean.drawSelection",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "tools.clean.clearSelection" }),
    );
    expect(onClearRoi).toHaveBeenCalledTimes(1);
  });

  it("does not render a fake region or delete button without ROI", () => {
    render(<CleanTab roi={null} onClearRoi={vi.fn()} />);

    expect(screen.getByText("tools.clean.noRegion")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "tools.clean.clearSelection" }),
    ).toBeNull();
  });
});
