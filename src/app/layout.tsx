import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Newsreader, Noto_Sans_JP } from "next/font/google";
import "./globals.css";

/* Latin UI face. Plex was drawn with a Japanese sibling in the same family,
   so it sits beside Noto Sans JP without either looking like a fallback. */
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/* Dates, yen amounts, citation sections. Tabular figures read as "official". */
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/* The one editorial voice: what this document actually is. */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/* Japanese. Variable, self-hosted, unicode-range chunked by next/font. */
const notoJp = Noto_Sans_JP({
  variable: "--font-noto-jp",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KAIFŪ — read the letter",
  description:
    "Photograph a Japanese document and get back what it is, what you must do, by when, and a reply in the right register. Nothing is stored.",
  applicationName: "KAIFU",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2eee6" },
    { media: "(prefers-color-scheme: dark)", color: "#14130f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable} ${notoJp.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
