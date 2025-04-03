import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  HomeIcon,
  ClockIcon,
  BookOpenIcon,
  CalendarIcon,
  Menu,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function MobileNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  const bottomNavItems = [
    {
      name: "Accueil",
      href: "/",
      icon: HomeIcon,
    },
    {
      name: "Entrées",
      href: "/daily-entries",
      icon: ClockIcon,
    },
    {
      name: "Café",
      href: "/cafe",
      icon: BookOpenIcon,
    },
    {
      name: "Calendrier",
      href: "/calendar",
      icon: CalendarIcon,
    },
  ];

  return (
    <>
      {/* Mobile Header */}
      <div className="md:hidden bg-white shadow-md p-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">CoworkCaisse</h1>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <Menu className="h-6 w-6" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">Menu</h2>
            </div>
            <div className="mt-6 space-y-1">
              {[
                {
                  name: "Tableau de bord",
                  href: "/",
                  icon: HomeIcon,
                },
                {
                  name: "Entrées journalières",
                  href: "/daily-entries",
                  icon: ClockIcon,
                },
                {
                  name: "Abonnements",
                  href: "/subscriptions",
                  icon: ClockIcon,
                },
                {
                  name: "Café & Boissons",
                  href: "/cafe",
                  icon: BookOpenIcon,
                },
                {
                  name: "Calendrier",
                  href: "/calendar",
                  icon: CalendarIcon,
                },
                {
                  name: "Rapports",
                  href: "/reports",
                  icon: BarChart3,
                },
              ].map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center px-4 py-3 text-sm font-medium rounded-md",
                      isActive
                        ? "text-white bg-primary"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <item.icon className="h-5 w-5 mr-3" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex md:hidden z-10">
        {bottomNavItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center py-3",
                isActive ? "text-primary" : "text-gray-500"
              )}
            >
              <item.icon className="h-6 w-6" />
              <span className="text-xs mt-1">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
