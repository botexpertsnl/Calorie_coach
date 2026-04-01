import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Macro Coach",
  description: "Personalized calorie and macro tracking with AI meal analysis."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
