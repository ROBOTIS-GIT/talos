"use client";

import Link from "next/link";
import type { ContainerInfo } from "@/types/api";

interface ContainerCardProps {
  container: ContainerInfo;
}

export default function ContainerCard({ container }: ContainerCardProps) {
  return (
    <Link href={`/containers/${container.name}`}>
      <div 
        className="p-4 border rounded transition-colors cursor-pointer"
        style={{
          backgroundColor: "var(--vscode-sidebar-background)",
          borderColor: "var(--vscode-panel-border)",
          color: "var(--vscode-foreground)"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--vscode-list-hoverBackground)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "var(--vscode-sidebar-background)";
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 
              className="text-base font-medium mb-1"
              style={{ color: "var(--vscode-foreground)" }}
            >
              {container.name}
            </h3>
            <p 
              className="text-xs"
              style={{ color: "var(--vscode-descriptionForeground)" }}
            >
              {container.socket_path}
            </p>
          </div>
          <svg
            className="w-4 h-4"
            style={{ color: "var(--vscode-descriptionForeground)" }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}
