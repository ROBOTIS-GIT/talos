"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

export default function Breadcrumbs() {
  const pathname = usePathname();

  const buildBreadcrumbs = () => {
    const crumbs: Array<{ label: string; href: string | null }> = [];

    if (pathname === "/") {
      crumbs.push({ label: "Containers", href: null });
      return crumbs;
    }

    if (pathname === "/docker") {
      crumbs.push({ label: "Docker Containers", href: null });
      return crumbs;
    }

    if (pathname === "/robot") {
      crumbs.push({ label: "Robot", href: null });
      return crumbs;
    }

    // Parse path segments
    const segments = pathname.split("/").filter(Boolean);

    // /robot, /robot/[container], /robot/[container]/topics/...
    if (segments[0] === "robot") {
      crumbs.push({ label: "Robot", href: "/robot" });
      if (segments.length >= 2) {
        const containerName = segments[1];
        if (segments[2] === "topics" && segments.length >= 4) {
          crumbs.push({ label: containerName, href: `/robot/${containerName}` });
          crumbs.push({ label: segments[3], href: null });
        } else {
          crumbs.push({ label: containerName, href: null });
        }
      }
      return crumbs;
    }

    // Always start with Containers
    crumbs.push({ label: "Containers", href: "/containers" });

    if (segments[0] === "containers" && segments.length > 1) {
      // Container name
      const containerName = segments[1];
      crumbs.push({
        label: containerName,
        href: `/containers/${containerName}`
      });

      if (segments[2] === "services" && segments.length > 3) {
        // Service name
        const serviceName = segments[3];

        if (segments[4] === "logs") {
          // Logs page - don't link to service page, just show it
          crumbs.push({
            label: serviceName,
            href: null
          });
          crumbs.push({ label: "Logs", href: null });
        } else if (segments[4] === "settings") {
          // Settings page
          crumbs.push({
            label: serviceName,
            href: null
          });
          crumbs.push({ label: "Settings", href: null });
        } else {
          // Service page (if it exists)
          crumbs.push({
            label: serviceName,
            href: `/containers/${containerName}/services/${serviceName}`
          });
        }
      } else if (segments.length === 2) {
        // Just container page - make it non-clickable
        crumbs[crumbs.length - 1].href = null;
      }
    }

    return crumbs;
  };

  const breadcrumbs = buildBreadcrumbs();

  if (breadcrumbs.length <= 1) {
    return (
      <span className="text-sm font-medium" style={{ color: "var(--vscode-foreground)" }}>
        {breadcrumbs[0]?.label || "Talos"}
      </span>
    );
  }

  return (
    <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <span key={index} className="flex items-center gap-1">
            {crumb.href && !isLast ? (
              <>
                <Link
                  href={crumb.href}
                  className="hover:underline"
                  style={{
                    color: "var(--vscode-textLink-foreground, var(--vscode-button-background))",
                    textDecoration: "none"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.textDecoration = "underline";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.textDecoration = "none";
                  }}
                >
                  {crumb.label}
                </Link>
                <span
                  className="mx-1"
                  style={{ color: "var(--vscode-descriptionForeground)" }}
                >
                  ›
                </span>
              </>
            ) : (
              <span
                className="font-medium"
                style={{ color: "var(--vscode-foreground)" }}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
