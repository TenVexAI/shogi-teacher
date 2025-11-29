import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Game Record Analysis',
  description: 'Analyze your Shogi games move by move',
  icons: [
    { rel: 'icon', url: '/icon.ico' },
    { rel: 'icon', url: '/icon.png', type: 'image/png' },
  ],
};

export default function AnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
