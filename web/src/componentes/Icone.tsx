import type { ReactNode } from "react";

export type NomeIcone =
  | "logo"
  | "wifi"
  | "bluetooth"
  | "moon"
  | "search"
  | "battery"
  | "control"
  | "folder"
  | "home"
  | "clock"
  | "image"
  | "music"
  | "download"
  | "cloud"
  | "grid"
  | "list"
  | "more"
  | "sun"
  | "volume"
  | "monitor"
  | "terminal"
  | "settings"
  | "browser"
  | "trash"
  | "play"
  | "skip"
  | "pause"
  | "chevron"
  | "plus"
  | "file"
  | "shield"
  | "cpu"
  | "power"
  | "lock"
  | "restart"
  | "note"
  | "back"
  | "up"
  | "close"
  | "check"
  | "edit"
  | "keyboard"
  | "info"
  | "disk"
  | "user"
  | "install"
  | "restore"
  | "video"
  | "archive"
  | "palette";

export function Icone({
  name,
  size = 20,
  strokeWidth = 1.8,
}: {
  name: NomeIcone;
  size?: number;
  strokeWidth?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<NomeIcone, ReactNode> = {
    logo: (
      <>
        <path d="M5 6.5 12 2l7 4.5v8.7L12 22l-7-6.8Z" />
        <path d="m8.5 8.5 3.5-2 3.5 2v4L12 15l-3.5-2.5Z" />
        <path d="M12 15v7M5 15.2l3.5-2.7M19 15.2l-3.5-2.7" />
      </>
    ),
    wifi: (
      <>
        <path d="M3 8.5a14.4 14.4 0 0 1 18 0M6.5 12a9.2 9.2 0 0 1 11 0M10 15.5a4.3 4.3 0 0 1 4 0" />
        <circle cx="12" cy="19" r=".8" fill="currentColor" stroke="none" />
      </>
    ),
    bluetooth: <path d="m8 7 8 10-4 3V4l4 3L8 17" />,
    moon: <path d="M20 15.3A8.4 8.4 0 0 1 8.7 4a8.4 8.4 0 1 0 11.3 11.3Z" />,
    search: (
      <>
        <circle cx="10.8" cy="10.8" r="6.8" />
        <path d="m16 16 4.5 4.5" />
      </>
    ),
    battery: (
      <>
        <rect x="2.5" y="7" width="17" height="10" rx="3" />
        <path d="M22 10v4M5.5 10.2h8.5v3.6H5.5z" fill="currentColor" stroke="none" />
      </>
    ),
    control: (
      <>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
    folder: (
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
    ),
    home: (
      <>
        <path d="m3.5 11 8.5-7 8.5 7" />
        <path d="M6 9.5V20h12V9.5M10 20v-6h4v6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="9" r="1.5" />
        <path d="m5.5 18 5-5 3 3 2-2 3 4" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12M7 11l5 5 5-5" />
        <path d="M5 20h14" />
      </>
    ),
    cloud: <path d="M7 18h11a4 4 0 0 0 .7-7.9A7 7 0 0 0 5.4 8.7 4.7 4.7 0 0 0 7 18Z" />,
    grid: (
      <>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </>
    ),
    list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    volume: (
      <>
        <path d="M4 10v4h4l5 4V6L8 10Z" />
        <path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11" />
      </>
    ),
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </>
    ),
    terminal: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <path d="m7 9 3 3-3 3M12.5 15H17" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    browser: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
      </>
    ),
    play: <path d="m9 7 8 5-8 5Z" fill="currentColor" />,
    pause: <path d="M9 7v10M15 7v10" strokeWidth="2.8" />,
    skip: (
      <>
        <path d="m6 8 6 4-6 4ZM12 8l6 4-6 4Z" fill="currentColor" stroke="none" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    file: (
      <>
        <path d="M6 2.8h8l4 4V21H6Z" />
        <path d="M14 3v5h4" />
      </>
    ),
    shield: <path d="M12 2.5 20 6v5.5c0 4.8-3.3 8.4-8 10-4.7-1.6-8-5.2-8-10V6Z" />,
    cpu: (
      <>
        <rect x="7" y="7" width="10" height="10" rx="2" />
        <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
      </>
    ),
    power: (
      <>
        <path d="M12 3v8" />
        <path d="M6.3 6.6a8 8 0 1 0 11.4 0" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
        <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      </>
    ),
    restart: (
      <>
        <path d="M20 12a8 8 0 1 1-2.6-5.9" />
        <path d="M20 4v4.5h-4.5" />
      </>
    ),
    note: (
      <>
        <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3h11A1.5 1.5 0 0 1 19 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5Z" />
        <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
      </>
    ),
    back: <path d="m15 18-6-6 6-6" />,
    up: <path d="m6 15 6-6 6 6" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    edit: <path d="M4 20h4L19 9l-4-4L4 16Z" />,
    keyboard: (
      <>
        <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
        <path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M6.5 14h.01M17 14h.01M9.5 14h5" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5h.01" />
      </>
    ),
    disk: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M7 15h.01M11 15h6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    install: (
      <>
        <path d="M12 3v11M7.5 9.5 12 14l4.5-4.5" />
        <rect x="3" y="16" width="18" height="5" rx="2" />
      </>
    ),
    restore: (
      <>
        <path d="M4 12a8 8 0 1 0 2.4-5.7" />
        <path d="M4 4v4.5h4.5" />
      </>
    ),
    video: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2.5" />
        <path d="m16 10.5 5-3v9l-5-3Z" />
      </>
    ),
    archive: (
      <>
        <rect x="3" y="4" width="18" height="5" rx="1.5" />
        <path d="M5 9v10.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.4-1.2-1.6-1.2-2.8 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z" />
        <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15" cy="7.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}
