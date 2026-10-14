const paths: Record<string, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  arrows: <path d="M7 3v16m0 0-4-4m4 4 4-4M17 21V5m0 0-4 4m4-4 4 4" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 7h6m-6 4h6m-6 4h3" />
    </>
  ),
  chart: <path d="M4 3v17h17M8 15l4-4 4 2 5-7" />,
  settings: (
    <>
      <path d="m12 3 2 3 4-.2.2 4 3 2-3 2-.2 4-4-.2-2 3-2-3-4 .2-.2-4-3-2 3-2 .2-4 4 .2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  down: <path d="M17 7 7 17m0 0h9M7 17V8" />,
  up: <path d="M7 17 17 7m0 0H8m9-1v10" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  right: <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 11h18m-12 4h.01m3.99 0h.01" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6m17 6h-5v5h5m-3-2.5h.01" />
    </>
  ),
  bank: <path d="m3 8 9-5 9 5M4 9h16M5 10v8m7-8v8m7-8v8M3 21h18M4 18h16" />,
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  x: <path d="m6 6 12 12M6 18 18 6" />,
  download: <path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5" />,
  print: <path d="M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6zM17 11h.01" />,
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
    </>
  ),
  logout: <path d="M9 4H4v16h5m5-13 5 5-5 5m-5-5h10" />,
  arrow: <path d="M4 12h16m-5-5 5 5-5 5" />,
  refresh: <path d="M3 11a9 9 0 1 1 2 7M3 5v6h6" />,
  edit: <path d="m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </>
  ),
};
export default function Icon({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
