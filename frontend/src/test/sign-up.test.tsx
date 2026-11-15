import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { SignUp } from "../routes/auth/sign-up";

const auth = vi.hoisted(() => ({
	signUp: vi.fn(),
	refetch: vi.fn(),
	toast: vi.fn(),
	session: null as { user: { id: string } } | null,
	error: null as { message: string } | null,
}));

vi.mock("@/lib/auth", () => ({
	authClient: {
		signUp: { email: auth.signUp },
		useSession: () => ({ data: auth.session, error: auth.error, refetch: auth.refetch }),
	},
}));
vi.mock("sonner", () => ({ toast: auth.toast }));

function Destination() {
	const location = useLocation();
	return <div data-testid="destination">{JSON.stringify(location)}</div>;
}

function mount(redirect?: string) {
	const TestApp = () => (
		<MemoryRouter initialEntries={[{
			pathname: "/auth/sign-up",
			search: redirect ? `?redirect=${encodeURIComponent(redirect)}` : "",
			state: { from: "report" },
		}]}>
			<Routes>
				<Route path="/auth/sign-up" element={<SignUp />} />
				<Route path="*" element={<Destination />} />
			</Routes>
		</MemoryRouter>
	);
	const view = render(<TestApp />);
	return { ...view, refresh: () => view.rerender(<TestApp />) };
}

async function submit() {
	fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "NewUser" } });
	fireEvent.change(screen.getByLabelText("Почта"), { target: { value: "new@example.invalid" } });
	fireEvent.change(screen.getByLabelText("Пароль", { exact: true }), { target: { value: "NewPassword123" } });
	fireEvent.change(screen.getByLabelText("Повторите пароль"), { target: { value: "NewPassword123" } });
	fireEvent.click(screen.getByRole("button", { name: "Зарегистрироваться" }));
	await waitFor(() => expect(auth.signUp).toHaveBeenCalledTimes(1));
}

beforeEach(() => {
	vi.resetAllMocks();
	auth.session = null;
	auth.error = null;
	auth.signUp.mockResolvedValue({ data: { user: { id: "new-user" } }, error: null });
	auth.refetch.mockResolvedValue(undefined);
});

describe("registration redirect", () => {
	it("waits for the new user's shared session and preserves the full return address and state", async () => {
		const view = mount("/app/dashboard/profile?section=security#password");
		await submit();
		await waitFor(() => expect(auth.refetch).toHaveBeenCalled());
		expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
		auth.session = { user: { id: "previous-user" } };
		view.refresh();
		expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
		auth.session = { user: { id: "new-user" } };
		view.refresh();
		const location = JSON.parse((await screen.findByTestId("destination")).textContent!);
		expect(location.pathname).toBe("/app/dashboard/profile");
		expect(location.search).toBe("?section=security");
		expect(location.hash).toBe("#password");
		expect(location.state).toEqual({ from: "report" });
	});

	it("opens the map when no return address was provided", async () => {
		auth.refetch.mockImplementation(async () => { auth.session = { user: { id: "new-user" } }; });
		mount();
		await submit();
		const location = JSON.parse((await screen.findByTestId("destination")).textContent!);
		expect(location.pathname).toBe("/app");
	});

	it("keeps the form and displays a registration error without refreshing the session", async () => {
		auth.signUp.mockResolvedValue({ data: null, error: { message: "Email already exists" } });
		mount();
		await submit();
		await waitFor(() => expect(auth.toast).toHaveBeenCalledWith("Email already exists"));
		expect(auth.refetch).not.toHaveBeenCalled();
		expect(screen.getByLabelText("Почта")).toHaveValue("new@example.invalid");
		expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
	});

	it("retries session refresh without registering a duplicate account after a network failure", async () => {
		auth.refetch.mockRejectedValueOnce(new Error("Network unavailable"));
		mount();
		await submit();
		await waitFor(() => expect(auth.toast).toHaveBeenCalled());
		auth.refetch.mockImplementation(async () => { auth.session = { user: { id: "new-user" } }; });
		await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Зарегистрироваться" })); });
		await waitFor(() => expect(auth.refetch).toHaveBeenCalledTimes(2));
		expect(auth.session).toEqual({ user: { id: "new-user" } });
		expect(auth.signUp).toHaveBeenCalledTimes(1);
		expect(auth.refetch).toHaveBeenCalledTimes(2);
	});
});
