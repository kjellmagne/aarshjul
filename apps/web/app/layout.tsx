import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Aarshjul",
  description: "Circular annual planning tool"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
