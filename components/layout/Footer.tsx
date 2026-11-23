import Link from "next/link";
import { Logo } from "@/components/common/Logo";

const footerLinks = {
  Organization: [
    { label: "About OROKO", href: "/about" },
    { label: "Constitution", href: "/governance/constitution" },
    { label: "Leadership", href: "/governance/executive" },
    { label: "General Assembly", href: "/governance/assembly" },
    { label: "Committees", href: "/governance/committees" },
  ],
  Engage: [
    { label: "Events", href: "/events" },
    { label: "Projects", href: "/projects" },
    { label: "Donate", href: "/donate" },
    { label: "Gallery", href: "/gallery" },
    { label: "Announcements", href: "/announcements" },
  ],
  Members: [
    { label: "Join OROKO", href: "/auth/register" },
    { label: "Member Login", href: "/auth/login" },
    { label: "Member Directory", href: "/members" },
    { label: "Documents", href: "/documents" },
  ],
};

const socialLinks = [
  {
    label: "Facebook",
    href: "https://www.facebook.com/profile.php?id=61596543104297",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
        <circle cx="12" cy="12" r="12" fill="#1877F2" />
        <path
          d="M15.8 12.7h-2.5v7.1h-3.1v-7.1H8.3v-2.6h1.9V8.3c0-2.1 1.2-3.3 3.2-3.3.9 0 1.9.2 1.9.2v2.1h-1.1c-1 0-1.3.6-1.3 1.3v1.5h2.4l-.5 2.6Z"
          fill="#fff"
        />
      </svg>
    ),
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/channel/UC4-bR1Uc6VjOrafYkcMomJQ",
    icon: (
      <svg viewBox="0 0 28 20" aria-hidden="true" className="size-6">
        <rect width="28" height="20" rx="5" fill="#FF0000" />
        <path d="m11.5 5.7 7.2 4.3-7.2 4.3V5.7Z" fill="#fff" />
      </svg>
    ),
  },
  {
    label: "Instagram",
    href: "https://www.instagram.com/orokointernational?avpt=NzBkengxd3dzMGFp",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
        <defs>
          <radialGradient id="instagramGradient" cx="30%" cy="107%" r="120%">
            <stop offset="0" stopColor="#FDF497" />
            <stop offset=".25" stopColor="#FDF497" />
            <stop offset=".4" stopColor="#FD5949" />
            <stop offset=".75" stopColor="#D6249F" />
            <stop offset="1" stopColor="#285AEB" />
          </radialGradient>
        </defs>
        <rect width="24" height="24" rx="7" fill="url(#instagramGradient)" />
        <rect x="5.2" y="5.2" width="13.6" height="13.6" rx="4" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="12" cy="12" r="3.3" fill="none" stroke="#fff" strokeWidth="2" />
        <circle cx="17.1" cy="6.9" r="1.2" fill="#fff" />
      </svg>
    ),
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-oroko-black text-white">
      {/* Gold divider */}
      <div className="oroko-divider" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {/* Brand column */}
          <div className="space-y-5">
            <Logo variant="light" size="md" />
            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
              A community-driven organisation dedicated to uniting and empowering the Oroko people at home and abroad.
            </p>
            <p className="text-oroko-gold text-xs tracking-[0.2em] uppercase font-medium">
              Unity · Development · Global Impact
            </p>
            <div className="flex items-center gap-3 pt-1" aria-label="Social media links">
              {socialLinks.map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit OROKO on ${social.label}`}
                  title={social.label}
                  className="size-10 rounded-full bg-white/10 flex items-center justify-center transition-all duration-200 hover:bg-white/20 hover:-translate-y-0.5"
                >
                  {social.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([heading, links]) => (
            <div key={heading} className="space-y-5">
              <h3 className="text-xs tracking-[0.2em] uppercase font-semibold text-oroko-gold">
                {heading}
              </h3>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-white/50 hover:text-white transition-colors duration-200"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/30 text-xs tracking-wider">
            &copy; {year} OROKO International Organization. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="/privacy"
              className="text-white/30 hover:text-white/60 text-xs tracking-wider transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-white/30 hover:text-white/60 text-xs tracking-wider transition-colors"
            >
              Terms of Use
            </Link>
            <a
              href="https://portfolio-2026-nine-weld.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="text-oroko-gold hover:text-white/60 text-xs tracking-wider transition-colors"
            >
              Contact Developer
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
