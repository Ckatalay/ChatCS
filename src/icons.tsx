type IconProps = { size?: number };

function base(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
}

export function PlusIcon({ size = 16 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SidebarIcon({ size = 18 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </svg>
  );
}

export function SendIcon({ size = 17 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2}>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

export function LogoutIcon({ size = 17 }: IconProps) {
  return (
    <svg {...base(size)}>
      <path d="M15 17l5-5-5-5M20 12H9M12 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
    </svg>
  );
}

export function CopyIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <svg {...base(size)} strokeWidth={2.2}>
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}
