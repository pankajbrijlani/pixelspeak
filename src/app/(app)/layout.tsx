import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/leads", label: "Leads" },
  { href: "/campaigns", label: "Cold Email" },
  { href: "/ads", label: "Meta Ads" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-neutral-800 bg-neutral-950 md:flex md:flex-col">
        <div className="px-5 py-5">
          <span className="text-sm font-semibold tracking-tight text-white">
            PixelSpeak <span className="text-violet-400">Growth</span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-sm text-neutral-300 transition hover:bg-neutral-900 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-neutral-800 p-3">
          <p className="truncate px-2 text-xs text-neutral-500">
            {session.user.email}
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-400 transition hover:bg-neutral-900 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-800 bg-neutral-950 px-4 py-3 md:hidden">
          <span className="text-sm font-semibold text-white">
            PixelSpeak <span className="text-violet-400">Growth</span>
          </span>
        </header>
        <main className="flex-1 bg-neutral-950 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
