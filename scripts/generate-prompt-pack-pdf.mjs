/**
 * node scripts/generate-prompt-pack-pdf.mjs
 * Writes public/prysmor-prompt-pack.pdf
 */
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "public", "prysmor-prompt-pack.pdf");

const GREEN = "#1FA84A";
const GREEN_SOFT = "#E8F8EE";
const INK = "#111111";
const MUTED = "#5C5C66";
const LINE = "#E4E4E8";
const CARD = "#F7F7F8";

const sections = [
  {
    title: "Relight",
    blurb: "Change mood and light. Keep the subject locked to your clip.",
    prompts: [
      "warm backlight, late afternoon haze",
      "cold blue moonlight from camera left",
      "soft window light, overcast morning",
      "golden hour rim light, gentle lens haze",
      "neon magenta and cyan side light, night club",
      "harsh noon sun, hard shadows on face",
      "candlelight warmth, intimate close-up",
      "fluorescent office green, slightly sickly",
      "cinematic top light, deep contrast",
      "sunset orange key, cool fill from behind",
      "soft beauty light, clean skin, low contrast",
      "stormy grey skylight, muted colors",
      "car headlight wash across the face",
      "fireplace glow from camera right",
      "harsh street lamp, night exterior",
      "diffused bounce light, product look",
      "red emergency light pulse, subtle",
      "morning sun through blinds, striped shadows",
      "cool hospital corridor lighting",
      "warm tungsten practicals only",
      "overcast Nordic light, flat and soft",
      "stage spotlight on subject, dark edges",
      "golden bounce from desert sand",
      "cyan sci-fi spill from screens",
      "dim undercabinet kitchen light",
      "bright overcast beach light",
      "purple club wash, soft haze",
      "single hard Rembrandt key light",
      "dusk blue hour, soft city glow",
      "harsh flash look, slight overexposure",
      "warm cafe window light, rainy day",
      "cool subway fluorescent mix",
      "sunset through trees, dappled light",
      "dim motel lamp, warm and dirty",
    ],
  },
  {
    title: "Background",
    blurb: "Swap the environment. Subject stays. No green screen.",
    prompts: [
      "neon city at night, soft bokeh",
      "foggy pine forest, early morning",
      "minimal white studio infinity wall",
      "rainy Tokyo street, wet reflections",
      "desert dunes at dusk, warm wind haze",
      "industrial warehouse, practical work lights",
      "rooftop overlooking downtown skyline",
      "cozy apartment living room, golden lamps",
      "underground subway platform, fluorescent strips",
      "snowy mountain ridge, overcast sky",
      "busy European cafe patio, soft daylight",
      "empty concrete parking garage",
      "lush tropical jungle path",
      "modern glass office lobby",
      "abandoned theater stage, red curtains",
      "quiet library aisle, warm lamps",
      "night highway overlook, city lights",
      "sunny suburban backyard",
      "dark recording studio, acoustic panels",
      "foggy bridge at dawn",
      "art gallery white walls, clean",
      "crowded night market, lanterns",
      "rocky coastline, crashing waves distant",
      "train station concourse, soft blur",
      "minimal black void backdrop",
      "rooftop greenhouse, plants and glass",
      "old brick alley, late afternoon",
      "luxury hotel lobby, marble and gold",
      "football stadium at night, empty seats",
      "misty lake dock, early morning",
      "cyberpunk alley, neon signs",
      "sunlit wheat field, wind motion",
      "airport terminal windows, soft blur",
    ],
  },
  {
    title: "VFX",
    blurb: "Add or remove. Describe the effect in one clear sentence.",
    prompts: [
      "heavy rain, keep subject dry",
      "thin smoke drifting across the frame",
      "embers floating upward behind the subject",
      "subtle heat haze rising from the ground",
      "remove the person walking in the background",
      "light snow falling, soft and sparse",
      "electric sparks near the metal railing",
      "dust particles in a shaft of light",
      "add a distant explosion glow on the horizon",
      "replace the phone screen with a bright UI glow",
      "add soft fog rolling along the ground",
      "remove the parked car behind the subject",
      "add falling cherry blossom petals",
      "subtle lens dirt and light streaks",
      "add rain streaks on a window in front",
      "remove text from the wall sign",
      "add steam rising from a coffee cup",
      "soft ash falling after a fire",
      "add floating soap bubbles in sunlight",
      "remove the power lines from the sky",
      "add a small fire in a metal barrel",
      "thin volumetric light beams through smoke",
      "add sparks from an angle grinder",
      "remove the logo from the jacket",
      "add distant lightning flash in clouds",
      "soft pollen floating in warm air",
      "add dripping water from the ceiling",
      "remove the second person on the left",
      "add glowing particles around the hands",
      "paper scraps blowing across the street",
      "add a faint magical shimmer in the air",
      "remove graffiti from the brick wall",
      "add wind-blown dust across the ground",
    ],
  },
];

const promptCount = sections.reduce((n, s) => n + s.prompts.length, 0);
if (promptCount !== 100) throw new Error(`Expected 100 prompts, got ${promptCount}`);

const M = 48;
const ROW_H = 44;
const PER_PAGE = 12; // readable density: ~12 prompts per page

function t(doc, str, x, y, opts = {}) {
  doc.text(str, x, y, { lineBreak: false, ...opts });
}

function stampFooter(doc, pageIndex, total) {
  const page = doc.page;
  const prevBottom = page.margins.bottom;
  page.margins.bottom = 0;
  const y = doc.page.height - 26;
  doc
    .save()
    .moveTo(M, y - 8)
    .lineTo(doc.page.width - M, y - 8)
    .strokeColor(LINE)
    .lineWidth(0.6)
    .stroke()
    .restore();
  t(doc.font("Helvetica").fontSize(9).fillColor(MUTED), "prysmor.io  ·  Prompt Pack · 100 prompts", M, y);
  t(doc, `${pageIndex} / ${total}`, doc.page.width - M - 40, y, { width: 40, align: "right" });
  page.margins.bottom = prevBottom;
}

async function build() {
  const chunks = [];
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: M, bottom: M, left: M, right: M },
    bufferPages: true,
    autoFirstPage: true,
    info: {
      Title: "Prysmor Prompt Pack",
      Author: "Prysmor",
      Subject: "100 prompts for Relight, Background, and VFX",
    },
  });
  doc.on("data", (c) => chunks.push(c));
  const finished = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks.map((c) => Buffer.from(c)))));
    doc.on("error", reject);
  });

  const realAddPage = doc.addPage.bind(doc);
  let allowAdd = false;
  doc.addPage = (...args) => {
    if (!allowAdd) throw new Error("Blocked unexpected PDFKit auto page break");
    allowAdd = false;
    return realAddPage(...args);
  };
  function addPage() {
    allowAdd = true;
    doc.addPage();
  }

  const pageW = doc.page.width;
  const contentW = pageW - M * 2;

  // ── Cover ──────────────────────────────────────────────
  doc.roundedRect(M, M, 86, 26, 6).fill(GREEN_SOFT);
  t(doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN), "PRYSMOR", M + 14, M + 7);

  t(doc.font("Helvetica-Bold").fontSize(36).fillColor(INK), "Prompt Pack", M, 110);
  t(
    doc.font("Helvetica").fontSize(14).fillColor(MUTED),
    "100 copy-ready prompts for Relight, Background, and VFX.",
    M,
    160
  );
  t(
    doc.font("Helvetica").fontSize(13).fillColor(MUTED),
    "Paste into the Prysmor panel inside Premiere Pro or After Effects.",
    M,
    184
  );

  let y = 240;
  t(doc.font("Helvetica-Bold").fontSize(14).fillColor(INK), "How to use", M, y);
  y += 28;
  [
    "Pick a mode that matches what you want to change.",
    "Copy one prompt. Keep it short and specific.",
    "Say what should stay the same: face, wardrobe, framing.",
    "Generate, review, then iterate with a tighter prompt.",
  ].forEach((tip, i) => {
    doc.roundedRect(M, y, contentW, 36, 8).fill(CARD);
    t(doc.font("Helvetica-Bold").fontSize(12).fillColor(GREEN), String(i + 1).padStart(2, "0"), M + 14, y + 11);
    t(doc.font("Helvetica").fontSize(12).fillColor(INK), tip, M + 52, y + 11);
    y += 46;
  });

  y += 18;
  t(doc.font("Helvetica-Bold").fontSize(14).fillColor(INK), "What's inside", M, y);
  y += 26;
  [
    [`Relight`, `${sections[0].prompts.length} prompts`, "Light and mood"],
    [`Background`, `${sections[1].prompts.length} prompts`, "Environment swaps"],
    [`VFX`, `${sections[2].prompts.length} prompts`, "Add or remove"],
  ].forEach(([name, count, note]) => {
    doc.roundedRect(M, y, contentW, 40, 8).fill(CARD);
    t(doc.font("Helvetica-Bold").fontSize(13).fillColor(INK), name, M + 16, y + 13);
    t(doc.font("Helvetica").fontSize(12).fillColor(MUTED), note, M + 140, y + 13);
    t(doc.font("Helvetica-Bold").fontSize(12).fillColor(GREEN), count, M + contentW - 110, y + 13, {
      width: 94,
      align: "right",
    });
    y += 50;
  });

  // Flatten with section markers for paging
  /** @type {{kind:'section', title:string, blurb:string} | {kind:'prompt', section:string, text:string, n:number}}[] */
  const items = [];
  let n = 1;
  for (const section of sections) {
    items.push({ kind: "section", title: section.title, blurb: section.blurb });
    for (const text of section.prompts) {
      items.push({ kind: "prompt", section: section.title, text, n });
      n += 1;
    }
  }

  // Build pages: section intro + prompts in chunks of PER_PAGE
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item.kind === "section") {
      addPage();
      // Section opener + first batch of prompts on same page
      t(doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN), "SECTION", M, M);
      t(doc.font("Helvetica-Bold").fontSize(28).fillColor(INK), item.title, M, M + 22);
      t(doc.font("Helvetica").fontSize(13).fillColor(MUTED), item.blurb, M, M + 58);
      doc
        .save()
        .moveTo(M, M + 84)
        .lineTo(M + contentW, M + 84)
        .strokeColor(LINE)
        .lineWidth(0.8)
        .stroke()
        .restore();

      i += 1;
      let row = 0;
      let yPos = M + 100;
      const maxRowsOnOpener = 9; // leave room for title block
      while (i < items.length && items[i].kind === "prompt" && row < maxRowsOnOpener) {
        const p = items[i];
        drawRow(doc, p.n, p.text, M, yPos, contentW);
        yPos += ROW_H + 8;
        row += 1;
        i += 1;
      }
      continue;
    }

    // Continuation page for remaining prompts in section
    addPage();
    const sectionTitle = item.section;
    t(doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN), `${sectionTitle.toUpperCase()}  ·  continued`, M, M);
    let yPos = M + 28;
    let row = 0;
    while (i < items.length && items[i].kind === "prompt" && items[i].section === sectionTitle && row < PER_PAGE) {
      const p = items[i];
      drawRow(doc, p.n, p.text, M, yPos, contentW);
      yPos += ROW_H + 8;
      row += 1;
      i += 1;
    }
  }

  // Closing CTA page
  addPage();
  t(doc.font("Helvetica-Bold").fontSize(11).fillColor(GREEN), "NEXT STEP", M, M + 40);
  t(doc.font("Helvetica-Bold").fontSize(28).fillColor(INK), "Ready to run these?", M, M + 70);
  t(
    doc.font("Helvetica").fontSize(14).fillColor(MUTED),
    "Get the Prysmor lifetime license.",
    M,
    M + 116
  );
  t(
    doc.font("Helvetica").fontSize(14).fillColor(MUTED),
    "Panel for Premiere Pro and After Effects,",
    M,
    M + 138
  );
  t(
    doc.font("Helvetica").fontSize(14).fillColor(MUTED),
    "with 200 seconds of AI VFX included.",
    M,
    M + 160
  );
  doc.roundedRect(M, M + 210, contentW, 88, 12).fill(GREEN_SOFT);
  t(doc.font("Helvetica-Bold").fontSize(16).fillColor(INK), "prysmor.io", M + 24, M + 238);
  t(
    doc.font("Helvetica").fontSize(12).fillColor(MUTED),
    "Copy a prompt. Select a clip. Generate on your timeline.",
    M + 24,
    M + 264
  );

  const range = doc.bufferedPageRange();
  for (let p = 0; p < range.count; p++) {
    doc.switchToPage(range.start + p);
    stampFooter(doc, p + 1, range.count);
  }

  const pageCount = range.count;
  doc.end();
  const buffer = await finished;
  return { buffer, pages: pageCount };
}

function drawRow(doc, num, prompt, x, y, width) {
  doc.roundedRect(x, y, width, ROW_H, 10).fill(CARD);
  t(doc.font("Helvetica-Bold").fontSize(12).fillColor(GREEN), String(num).padStart(2, "0"), x + 16, y + 14);
  t(doc.font("Helvetica").fontSize(13).fillColor(INK), prompt, x + 56, y + 14, {
    width: width - 72,
    ellipsis: true,
  });
}

const result = await build();
fs.writeFileSync(outPath, result.buffer);
console.log(`Wrote ${outPath}`);
console.log(`${promptCount} prompts · ${result.pages} pages`);
