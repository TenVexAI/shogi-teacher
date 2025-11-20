import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Learn to Play Shogi',
  description: 'Learn the rules, pieces, and strategies of Shogi',
  icons: [
    { rel: 'icon', url: '/icon.ico' },
    { rel: 'icon', url: '/icon.png', type: 'image/png' },
  ],
};

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
