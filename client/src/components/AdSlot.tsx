import type { Banner } from "../api";

/** One admin-managed creative — image proxied via /api/banner-img/:id. */
export default function AdSlot({ banner, className = "" }: { banner: Banner; className?: string }) {
  return (
    <a
      href={banner.linkUrl}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={`f-banner ${className}`}
      title={banner.title}
    >
      <img src={banner.imageUrl} alt={banner.title} loading="lazy" decoding="async" />
    </a>
  );
}
