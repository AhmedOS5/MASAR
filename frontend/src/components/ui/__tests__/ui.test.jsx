// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useMutation, useQuery } from "@tanstack/react-query";
import QueryState from "@/components/ui/QueryState";
import Pagination from "@/components/ui/Pagination";
import { ApiError } from "@/lib/http";
import { renderWithProviders } from "@/test/render";

afterEach(() => vi.unstubAllGlobals());

function Probe({ fn }) {
  const query = useQuery({ queryKey: ["probe"], queryFn: fn });
  return (
    <QueryState query={query} isEmpty={(d) => d.length === 0} emptyText="لا شيء">
      {(rows) => <ul>{rows.map((r) => <li key={r}>{r}</li>)}</ul>}
    </QueryState>
  );
}

describe("QueryState (loading / error / empty boundaries)", () => {
  it("shows a loading skeleton, then the data", async () => {
    let release;
    renderWithProviders(<Probe fn={() => new Promise((r) => (release = () => r(["a", "b"])))} />);
    expect(screen.getByLabelText("جاري التحميل")).toBeInTheDocument();
    release();
    expect(await screen.findByText("a")).toBeInTheDocument();
    expect(screen.queryByLabelText("جاري التحميل")).not.toBeInTheDocument();
  });

  it("shows the API error in an alert banner and recovers on retry", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, "تعذر تحميل البيانات من الخادم"))
      .mockResolvedValueOnce(["recovered"]);
    renderWithProviders(<Probe fn={fn} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل البيانات من الخادم");
    await userEvent.setup().click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("recovered")).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("shows the empty state when the API returns nothing", async () => {
    renderWithProviders(<Probe fn={async () => []} />);
    expect(await screen.findByText("لا شيء")).toBeInTheDocument();
  });
});

describe("failed mutations raise a toast (global handler) unless silenced", () => {
  function Action({ silent }) {
    const m = useMutation({
      mutationFn: async () => {
        throw new ApiError(422, "فشلت العملية: البيانات غير صالحة");
      },
      meta: { silent },
    });
    return <button onClick={() => m.mutate()}>go</button>;
  }

  it("toasts the server message", async () => {
    renderWithProviders(<Action />);
    await userEvent.setup().click(screen.getByText("go"));
    expect(await screen.findByRole("alert")).toHaveTextContent("فشلت العملية: البيانات غير صالحة");
  });

  it("stays quiet when the caller handles the error inline (meta.silent)", async () => {
    renderWithProviders(<Action silent />);
    await userEvent.setup().click(screen.getByText("go"));
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts can be dismissed", async () => {
    renderWithProviders(<Action />);
    const user = userEvent.setup();
    await user.click(screen.getByText("go"));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "إغلاق" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    renderWithProviders(<Pagination page={1} lastPage={1} onChange={() => {}} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("drives page changes and disables the edges", async () => {
    const onChange = vi.fn();
    renderWithProviders(<Pagination page={1} lastPage={5} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "السابق" })).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "التالي" }));
    await user.click(screen.getByRole("button", { name: "5" }));
    expect(onChange).toHaveBeenNthCalledWith(1, 2);
    expect(onChange).toHaveBeenNthCalledWith(2, 5);
    expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
  });
});
