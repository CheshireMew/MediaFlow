/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { WindowControls } from "../components/layout/WindowControls";

const windowServiceMock = vi.hoisted(() => ({
  minimize: vi.fn(),
  maximize: vi.fn(),
  close: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../services/desktop", () => ({
  windowService: windowServiceMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("localized shell controls", () => {
  it("names all window buttons through i18n", () => {
    render(<WindowControls />);
    fireEvent.click(screen.getByRole("button", { name: "windowControls.minimize" }));
    fireEvent.click(screen.getByRole("button", { name: "windowControls.maximize" }));
    fireEvent.click(screen.getByRole("button", { name: "windowControls.close" }));
    expect(windowServiceMock.minimize).toHaveBeenCalledOnce();
    expect(windowServiceMock.maximize).toHaveBeenCalledOnce();
    expect(windowServiceMock.close).toHaveBeenCalledOnce();
  });

  it("renders a localized, announced error fallback", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Crasher = () => {
      throw new Error("boom");
    };
    render(
      <ErrorBoundary>
        <Crasher />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("errorBoundary.title");
    expect(screen.getByRole("button", { name: "errorBoundary.reload" })).toBeInTheDocument();
  });
});
