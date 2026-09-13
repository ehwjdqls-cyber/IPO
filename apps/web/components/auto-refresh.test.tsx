// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("AutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    refresh.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("active가 true이면 주기적으로 router.refresh를 호출한다", async () => {
    const { AutoRefresh } = await import("./auto-refresh");
    render(<AutoRefresh active={true} />);

    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("active가 false이면 refresh를 호출하지 않는다", async () => {
    const { AutoRefresh } = await import("./auto-refresh");
    render(<AutoRefresh active={false} />);

    vi.advanceTimersByTime(10000);

    expect(refresh).not.toHaveBeenCalled();
  });

  it("언마운트되면 더 이상 refresh를 호출하지 않는다", async () => {
    const { AutoRefresh } = await import("./auto-refresh");
    const { unmount } = render(<AutoRefresh active={true} />);

    unmount();
    vi.advanceTimersByTime(10000);

    expect(refresh).not.toHaveBeenCalled();
  });
});
