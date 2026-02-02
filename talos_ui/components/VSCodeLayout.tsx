"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import Breadcrumbs from "./Breadcrumbs";

export default function VSCodeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: "/robot", label: "Robot", icon: "🤖" },
    { href: "/containers", label: "Containers", icon: "📦" },
    { href: "/docker", label: "Docker", icon: "🐳" },
  ];

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      {/* Sidebar */}
      <div 
        className="flex flex-col"
        style={{ 
          backgroundColor: "var(--vscode-sidebar-background)",
          borderRight: "1px solid var(--vscode-sidebar-border)",
          width: "200px",
          minWidth: "200px"
        }}
      >
        {/* Sidebar Header */}
        <div 
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: "var(--vscode-sidebar-border)" }}
        >
          <h1 
            className="text-sm font-semibold"
            style={{ color: "var(--vscode-foreground)" }}
          >
            TALOS
          </h1>
          <ThemeToggle />
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 py-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== "/" && pathname?.startsWith(item.href));
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-2 text-sm transition-colors"
                style={{
                  backgroundColor: isActive 
                    ? "var(--vscode-list-activeSelectionBackground)" 
                    : "transparent",
                  color: isActive 
                    ? "var(--vscode-foreground)" 
                    : "var(--vscode-descriptionForeground)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }
                }}
              >
                <span className="mr-2">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Main Content Area */}
      <main 
        className="flex-1 flex flex-col overflow-hidden"
        style={{ backgroundColor: "var(--vscode-editor-background)" }}
      >
        {/* Title Bar */}
        <div 
          className="px-4 py-2 border-b flex items-center gap-2"
          style={{ 
            borderColor: "var(--vscode-panel-border)",
            backgroundColor: "var(--vscode-editor-background)"
          }}
        >
          <Breadcrumbs />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
