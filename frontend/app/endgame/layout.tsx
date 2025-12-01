import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Endgame Training',
};

export default function EndgameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
