import starlight from "@astrojs/starlight"
import { defineConfig } from "astro/config"

export default defineConfig({
  site: "https://jcafeitosa.github.io/devclaw",
  integrations: [
    starlight({
      title: "DevClaw",
      description: "Autonomous software development team for solo developers.",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/jcafeitosa/devclaw" }],
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "index" },
            { label: "Architecture", slug: "guides/architecture" },
            { label: "Phases", slug: "guides/phases" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Packages", slug: "reference/packages" },
            { label: "Protocols", slug: "reference/protocols" },
          ],
        },
      ],
    }),
  ],
})
