import type { BarcodeFormat } from "./types";

export type NormalizedBarcode = {
  raw: string;
  value: string;
  gtin14: string;
  format: BarcodeFormat;
};

function digits(value: string) {
  return value.replace(/[\s-]/g, "");
}

export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error("A barcode can contain digits only.");
  let sum = 0;
  for (let index = body.length - 1, position = 0; index >= 0; index--, position++) {
    sum += Number(body[index]) * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidGtinCheckDigit(value: string): boolean {
  return /^\d{8}$|^\d{12,14}$/.test(value) && gtinCheckDigit(value.slice(0, -1)) === Number(value.at(-1));
}

export function expandUpce(value: string): string {
  if (!/^\d{8}$/.test(value) || !["0", "1"].includes(value[0])) throw new Error("Unsupported UPC-E barcode.");
  const numberSystem = value[0], payload = value.slice(1, 7), check = value[7];
  const last = payload[5];
  let manufacturer: string, product: string;
  if (["0", "1", "2"].includes(last)) {
    manufacturer = payload.slice(0, 2) + last + "00";
    product = "00" + payload.slice(2, 5);
  } else if (last === "3") {
    manufacturer = payload.slice(0, 3) + "00";
    product = "000" + payload.slice(3, 5);
  } else if (last === "4") {
    manufacturer = payload.slice(0, 4) + "0";
    product = "0000" + payload[4];
  } else {
    manufacturer = payload.slice(0, 5);
    product = "0000" + last;
  }
  return numberSystem + manufacturer + product + check;
}

export function normalizeBarcode(input: string, hintedFormat?: BarcodeFormat): NormalizedBarcode {
  const raw = input.trim();
  const value = digits(raw);
  if (!/^\d+$/.test(value)) throw new Error("A barcode can contain digits, spaces, or hyphens only.");
  if (![8, 12, 13, 14].includes(value.length)) throw new Error("Enter an 8, 12, 13, or 14 digit food barcode.");
  let format: BarcodeFormat;
  let lookup = value;
  if (value.length === 8 && hintedFormat === "upc_e") {
    format = "upc_e";
    lookup = expandUpce(value);
    if (!hasValidGtinCheckDigit(lookup)) throw new Error("This UPC-E barcode has an invalid check digit.");
  } else {
    if (!hasValidGtinCheckDigit(value)) throw new Error("This barcode has an invalid check digit.");
    if (value.length === 8) format = "ean_8";
    else if (value.length === 12) format = "upc_a";
    else if (value.length === 13) format = "ean_13";
    else format = hintedFormat === "itf" ? "itf" : "gtin_14";
  }
  return { raw, value: lookup, gtin14: lookup.padStart(14, "0"), format };
}

export function createDuplicateGuard(windowMs = 1800) {
  const seen = new Map<string, number>();
  return (barcode: string, now = Date.now()) => {
    const previous = seen.get(barcode);
    seen.set(barcode, now);
    for (const [code, time] of seen) if (now - time > windowMs) seen.delete(code);
    return previous !== undefined && now - previous <= windowMs;
  };
}
