"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  description: string;
  badge?: string;
};

export function AppShell({
  title,
  summary,
  navItems,
  children,
}: {
  title: string;
  summary?: ReactNode;
  navItems: NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header-inner">
          <Link href="/" className="logo">
            <span className="logo-allo">Allo</span>
            <span className="logo-store">Store</span>
          </Link>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-section-title">Navigation</div>

        <nav className="sidebar-nav" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-nav-item${pathname === item.href ? " is-active" : ""}`}
            >
              <div className="sidebar-nav-item-row">
                <span className="sidebar-nav-label">{item.label}</span>
                <span className="sidebar-nav-chevron">›</span>
              </div>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer-status">
          <span className="sidebar-status-dot" /> All systems operational
        </div>
      </aside>

      <section className="shell-content">
        <div className="page-shell">{children}</div>
      </section>
    </div>
  );
}
