import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LIFEOS",
    short_name: "LIFEOS",
    description: "Personal life-management and decision-intelligence app",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#111c33",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
