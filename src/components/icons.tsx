export type IconName =
  | "home"
  | "list"
  | "trend"
  | "budget"
  | "wallet"
  | "tag"
  | "plus"
  | "arrow"
  | "transfer"
  | "chevron"
  | "search"
  | "more"
  | "logout"
  | "check"
  | "alert"
  | "calendar"
  | "user"
  | "chevron-down"
  | "bank"
  | "target";
const paths: Record<IconName, string> = {
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  "chevron-down": "m6 9 6 6 6-6",
  bank: "m3 9 9-6 9 6H3ZM5 10v8M10 10v8M14 10v8M19 10v8M3 21h18M4 18h16",
  user: "M20 21v-2a7 7 0 0 0-14 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  home: "M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  trend: "M3 17l6-6 4 4 8-10M15 5h6v6",
  budget: "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16M8 14h2M14 14h2M8 18h2",
  wallet:
    "M20 8V5H5a2 2 0 0 1 0-4h13v4M3 3v16a2 2 0 0 0 2 2h15V8H5M20 12h-5v5h5M16 14.5h.01",
  tag: "M3 3h8l10 10-8 8L3 11zM7 7h.01",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  transfer: "M3 7h17M16 3l4 4-4 4M21 17H4M8 13l-4 4 4 4",
  chevron: "m9 5 7 7-7 7",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  logout: "M9 4H4v16h5M10 12h11M16 7l5 5-5 5",
  check: "m5 12 4 4L19 6",
  alert: "M12 3 2 21h20L12 3zM12 9v5M12 17h.01",
  calendar: "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16",
};
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
