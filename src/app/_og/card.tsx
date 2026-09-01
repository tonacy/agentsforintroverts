import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const shareCardAlt =
  "Agents for Introverts — out there the feeds never stop; in here I get a slow one.";

export const shareCardSize = { width: 1200, height: 630 };

const assetDir = join(process.cwd(), "src", "app");

export async function renderShareCard() {
  const [newsreaderItalic, plexMono, inter, mark] = await Promise.all([
    readFile(join(assetDir, "_fonts", "newsreader-italic.woff")),
    readFile(join(assetDir, "_fonts", "plex-mono-400.woff")),
    readFile(join(assetDir, "_fonts", "inter-400.woff")),
    readFile(join(assetDir, "_assets", "mark-og.png")),
  ]);

  const markSrc = `data:image/png;base64,${mark.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "76px 80px",
          backgroundColor: "#FDFBF7",
          backgroundImage:
            "linear-gradient(152deg, #FDFBF7 0%, #FDFBF7 58%, #FAF6F0 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 760,
            height: "100%",
          }}
        >
          <div
            style={{
              fontFamily: "Plex Mono",
              fontSize: 20,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#888888",
            }}
          >
            Agents for Introverts
          </div>

          <div
            style={{
              marginTop: 30,
              fontFamily: "Newsreader",
              fontStyle: "italic",
              fontSize: 68,
              lineHeight: 1.16,
              letterSpacing: "-0.02em",
              color: "#111111",
            }}
          >
            Out there the feeds never stop. In here I get a slow one.
          </div>

          <div
            style={{
              width: 60,
              height: 1,
              marginTop: 34,
              backgroundColor: "rgba(15, 74, 56, 0.35)",
            }}
          />

          <div
            style={{
              marginTop: 30,
              fontSize: 26,
              lineHeight: 1.4,
              color: "#444444",
              fontFamily: "Inter",
            }}
          >
            Thursday morning is still yours.
          </div>

          <div
            style={{
              marginTop: 26,
              fontFamily: "Plex Mono",
              fontSize: 18,
              letterSpacing: "0.06em",
              color: "#888888",
            }}
          >
            agents translate · calendar · X · LinkedIn · email · newsletter
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            height: "100%",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markSrc} width={300} height={300} alt="" />
        </div>
      </div>
    ),
    {
      ...shareCardSize,
      fonts: [
        {
          name: "Newsreader",
          data: newsreaderItalic,
          weight: 400,
          style: "italic",
        },
        {
          name: "Plex Mono",
          data: plexMono,
          weight: 400,
          style: "normal",
        },
        {
          name: "Inter",
          data: inter,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );
}
