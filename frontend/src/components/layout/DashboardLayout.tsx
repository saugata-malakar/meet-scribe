"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";
import {
  LayoutDashboard,
  Video,
  Settings,
  Shield,
  LogOut,
  Zap,
  ChevronRight,
} from "lucide-react";
import { clsx } from "clsx";
import { motion } from "framer-motion";
import toast from "react-hot-toast";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/sessions", label: "Sessions", icon: Video },
];

const adminItems = [
  { href: "/admin", label: "Admin Panel", icon: Shield },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isAdmin } = useAuthStore();

  const handleLogout = () => {
    logout();
    toast.success("Signed out");
    router.push("/login");
  };

  return (
    <div className="flex h-screen bg-void overflow-hidden">
      {/* Sidebar */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="w-60 flex flex-col border-r border-white/5 bg-black/20 backdrop-blur-xl shrink-0"
      >
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-plasma/20 border border-plasma/40 flex items-center justify-center">
            <Zap size={16} className="text-plasma-400" />
          </div>
          <span className="font-display font-700 text-sm tracking-wide text-white">
            MeetScribe
          </span>
        </Link>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 mt-2">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link key={href} href={href}>
                <div
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                    active
                      ? "bg-plasma/15 border border-plasma/25 text-plasma-300"
                      : "text-white/40 hover:text-white/80 hover:bg-white/5"
                  )}
                >
                  <Icon size={16} className={active ? "text-plasma-400" : "text-white/30 group-hover:text-white/60"} />
                  <span className="font-body">{label}</span>
                  {active && <ChevronRight size={12} className="ml-auto text-plasma-400" />}
                </div>
              </Link>
            );
          })}

          {isAdmin() && (
            <div className="pt-4 mt-4 border-t border-white/5">
              <p className="px-3 pb-2 text-xs text-white/20 font-mono uppercase tracking-widest">Admin</p>
              {adminItems.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href}>
                    <div
                      className={clsx(
                        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                        active
                          ? "bg-aurora-violet/15 border border-aurora-violet/25 text-purple-300"
                          : "text-white/40 hover:text-white/80 hover:bg-white/5"
                      )}
                    >
                      <Icon size={16} />
                      <span className="font-body">{label}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/3">
            <div className="w-8 h-8 rounded-full bg-plasma/20 border border-plasma/30 flex items-center justify-center text-xs font-display text-plasma-300">
              {user?.name?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80 truncate">{user?.name}</p>
              <p className="text-xs text-white/30 truncate">{user?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-white/25 hover:text-aurora-rose transition-colors"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Grid background */}
        <div className="fixed inset-0 bg-grid-void bg-grid opacity-100 pointer-events-none" />
        <div className="fixed inset-0 bg-glow-plasma pointer-events-none" />
        <div className="relative z-10">{children}</div>
      </main>
    </div>
  );
}
