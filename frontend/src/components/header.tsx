import { Separator } from "@radix-ui/react-separator";
import { SidebarTrigger } from "./ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import { useState } from "react";
import { Button } from "./ui/button";
import { authClient } from "@/lib/auth";
import { useLocation, useNavigate } from "react-router";
import { FRONT_PATHS } from "@/types/paths";
import { PagesData } from "./app-sidebar";

const findPageName = (location: string) => {
  for(const section of PagesData.navMain) {
    for(const page of section.items) {
      if(page.url === location) {
        return page.title
      }
    }
  }
  return ""
} 

export const Header = () => {
  const navigate = useNavigate();
  const location = useLocation()
  const [str, setStr] = useState("GreenMapper");
  const { data: session } = authClient.useSession();

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      {session && <SidebarTrigger className="-ml-1" />}
      <Separator orientation="vertical" className="mr-2 h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden md:block">
            <BreadcrumbLink onClick={() => {
              setStr("Green Mapper")
              navigate(`/${FRONT_PATHS.APP}`)
              }}>
              {str}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="hidden md:block" />
          <BreadcrumbItem>
            <BreadcrumbPage>{findPageName(location.pathname)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Button
        className="ml-auto"
        onClick={() => {
          if(session) {
            authClient.signOut().then(() => navigate("/"));
          } else {
            navigate(`/${FRONT_PATHS.AUTH}/${FRONT_PATHS.LOGIN}?redirect=${encodeURIComponent(location.pathname+location.search+location.hash)}`)
          }
        }}
      >
        {session ? "Выйти" : "Войти"}
      </Button>
    </header>
  );
};
