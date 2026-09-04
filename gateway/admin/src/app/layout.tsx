import './globals.css';

export const metadata = {
  title: 'Enigma Admin',
  description: 'Governance console for the Enigma AI Governance Gateway',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
