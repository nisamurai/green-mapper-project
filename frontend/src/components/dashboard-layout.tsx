import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { Outlet } from "react-router";
import { authClient } from "@/lib/auth";
import { LoadingSpinner } from "./ui/spinner";
import { FRONT_PATHS } from "@/types/paths";

export const DashboardLayout = () => {
  const { data: session, isPending, error } = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation()

  useEffect(() => {
    if (!isPending && !session) {
      navigate(`/${FRONT_PATHS.AUTH}/${FRONT_PATHS.LOGIN}?redirect=${encodeURIComponent(location.pathname+location.search+location.hash)}`, {state: location.state});
    }
  }, [isPending, session, navigate]);

  if (isPending)
    return (
      <div className="flex items-center justify-center max-h-maxflex min-h-svh flex-col">
        <LoadingSpinner />
      </div>
    );

    
  if (error) return <div>Error: {error.message}</div>;
    
  return <Outlet />;
};
