"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scan", label: "Scan" },
  { href: "/strategy", label: "Strategy" },
  { href: "/decisions", label: "Decisions" },
  { href: "/learning", label: "Learning" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-6">
      <span className="text-white font-bold text-sm tracking-tight mr-4">
        Trading Assistant
        <span className="ml-2 text-xs text-yellow-500 font-normal">PAPER</span>
      </span>
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`text-sm transition-colors ${
            pathname.startsWith(href)
              ? "text-white font-medium"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
