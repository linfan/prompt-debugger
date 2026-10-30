import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

describe("app shell", () => {
  it("switches tabs and collapses the workspace sidebar", () => {
    render(<App />);
    expect(screen.getByText("Shape a better prompt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Response" }));
    expect(screen.getByText("Inspect every detail")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    expect(screen.queryByText("WORKSPACE")).not.toBeInTheDocument();
  });
});
