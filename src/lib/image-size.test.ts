import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { imageSize } from "@/lib/image-size";

const sample = (name: string) =>
  readFileSync(path.join(__dirname, "../../public/samples", name)).toString("base64");

/** Minimal baseline JPEG: SOI, APP0, SOF0 (h=3138, w=2064), then nothing else. */
function jpegHeader(marker: number, w: number, h: number): string {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.alloc(2 + 2 + 6);
  sof[0] = 0xff;
  sof[1] = marker;
  sof.writeUInt16BE(8, 2);
  sof[4] = 8;
  sof.writeUInt16BE(h, 5);
  sof.writeUInt16BE(w, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]).toString("base64");
}

describe("imageSize", () => {
  it("reads a baseline (SOF0) JPEG frame header", () => {
    expect(imageSize(jpegHeader(0xc0, 2064, 3138))).toEqual({ w: 2064, h: 3138 });
  });

  it("reads a progressive (SOF2) JPEG frame header", () => {
    expect(imageSize(jpegHeader(0xc2, 640, 480))).toEqual({ w: 640, h: 480 });
  });

  it("reads a PNG IHDR", () => {
    expect(imageSize(sample("school-excursion.png"))).toEqual({ w: 1880, h: 2910 });
  });

  it("reads a real photographed sample JPEG", () => {
    expect(imageSize(sample("school-excursion.photo.jpg"))).toEqual({ w: 2064, h: 3138 });
  });

  it("returns null for anything it cannot read", () => {
    expect(imageSize("")).toBeNull();
    expect(imageSize(Buffer.from("not an image at all").toString("base64"))).toBeNull();
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2]).toString("base64"))).toBeNull();
  });
});
