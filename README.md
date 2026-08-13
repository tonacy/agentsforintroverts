# Agents for Introverts

Marketing site for [agentsforintroverts.com](https://agentsforintroverts.com) — AI agents that handle the loud work so introverts can stay in deep work.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Deployment**: Cloudflare Pages (static export)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### Build

```bash
npm run build
```

This creates a static export in the `out/` directory.

## Deployment (Cloudflare Pages)

### First-time Setup

1. **Install Wrangler CLI** (included as dev dependency, or install globally):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

   This builds the site and deploys to Cloudflare Pages. On first deploy, Wrangler will create the `agentsforintroverts` project.

### Subsequent Deploys

```bash
npm run deploy
```

### Custom Domain Setup

After the first deploy:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **agentsforintroverts** → **Custom domains**
3. Add `agentsforintroverts.com`
4. Follow Cloudflare's DNS instructions to point your domain

## Project Structure

```
src/
├── app/
│   ├── globals.css      # Global styles and Tailwind config
│   ├── layout.tsx       # Root layout with metadata
│   └── page.tsx         # Home page
└── components/
    ├── index.ts         # Component exports
    ├── EmailForm.tsx    # Email capture form (client-side)
    ├── Nav.tsx          # Navigation bar
    ├── Hero.tsx         # Hero section with headline
    ├── AgentCards.tsx   # The 5 agent cards
    ├── Proof.tsx        # Proof points section
    ├── Audience.tsx     # Target audience section
    ├── Founder.tsx      # Founder note from Tony
    ├── CTABand.tsx      # Final CTA section
    └── Footer.tsx       # Site footer
```

## Email Capture

The email form is client-side only with validation. See the `TODO` comment in `src/components/EmailForm.tsx` for integration with Resend/Supabase when ready.

## License

Private — Tony Llongueras
