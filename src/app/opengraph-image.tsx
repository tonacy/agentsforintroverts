import { renderShareCard, shareCardAlt, shareCardSize } from "./_og/card";

export const dynamic = "force-static";

export const alt = shareCardAlt;
export const size = shareCardSize;
export const contentType = "image/png";

export default function Image() {
  return renderShareCard();
}
