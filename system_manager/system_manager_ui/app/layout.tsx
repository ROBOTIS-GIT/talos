import type { Metadata } from "next";
import "./globals.css";
import VSCodeLayout from "@/components/VSCodeLayout";
import { ThemeProvider } from "@/contexts/ThemeContext";

export const metadata: Metadata = {
  title: "System Manager",
  description: "Manage ROS2-based robot containers and services",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme');
                  if (theme === 'light' || theme === 'dark') {
                    document.documentElement.setAttribute('data-theme', theme);
                  } else {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
                  }
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="antialiased" style={{ height: "100vh", margin: 0, padding: 0 }}>
        <ThemeProvider>
          <VSCodeLayout>{children}</VSCodeLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
