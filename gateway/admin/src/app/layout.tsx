import './globals.css';
import { ThemeProvider, THEME_BOOT_SCRIPT } from '@/components/ThemeProvider';

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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
