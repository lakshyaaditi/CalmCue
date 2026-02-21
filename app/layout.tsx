import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CalmCue — Neurodivergent-Friendly Voice Chat",
  description: "Real-time audio dynamics adaptation to reduce sensory overload",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <div className="grid-dots" />
        <div className="glow-bg" />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
