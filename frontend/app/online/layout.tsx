import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shogi Teacher Online",
};

export default function OnlineLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
