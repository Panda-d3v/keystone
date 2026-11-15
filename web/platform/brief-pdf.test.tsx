// @vitest-environment node
import React from "react";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { fixtureData } from "@/lib/data";
import { BriefDocument, registerBriefFonts } from "./brief-pdf";

it("renders the downloadable Brief with the platform fonts", async () => {
  registerBriefFonts(join(process.cwd(), "public", "fonts"));
  const buffer = await renderToBuffer(<BriefDocument data={fixtureData} />);
  expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  const text = buffer.toString("latin1");
  expect(text).toMatch(/DMSans/);
  expect(text).toMatch(/DMMono/);
  if (process.env.BRIEF_PDF_OUT) writeFileSync(process.env.BRIEF_PDF_OUT, buffer);
}, 30000);
