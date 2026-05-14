type Variant = "green" | "red" | "yellow" | "blue" | "gray";

const variants: Record<Variant, string> = {
  green: "bg-emerald-900/50 text-emerald-400 border border-emerald-800",
  red: "bg-red-900/50 text-red-400 border border-red-800",
  yellow: "bg-yellow-900/50 text-yellow-400 border border-yellow-800",
  blue: "bg-blue-900/50 text-blue-400 border border-blue-800",
  gray: "bg-zinc-800 text-zinc-400 border border-zinc-700",
};

export function Badge({
  children,
  variant = "gray",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}
