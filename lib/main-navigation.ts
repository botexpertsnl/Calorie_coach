export type MainNavItem = {
  label: string;
  href: string;
};

export const MAIN_NAV_ITEMS: MainNavItem[] = [
  { label: "Meals", href: "/" },
  { label: "Workouts", href: "/workouts" },
  { label: "Insights", href: "/insights" },
  { label: "Profile", href: "/profile" }
];
