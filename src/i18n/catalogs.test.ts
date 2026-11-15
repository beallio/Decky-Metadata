import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./steamLanguage";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES_DIR = path.join(SRC_DIR, "locales");
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

type Catalog = Record<string, unknown>;

const flatten = (value: unknown, prefix = "", out: Catalog = {}): Catalog => {
  if (!value || typeof value !== "object") {
    out[prefix] = value;
    return out;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
};

const loadCatalog = (locale: string): Catalog =>
  JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8")) as Catalog;

const pluralBase = (key: string): string | null => {
  const match = key.match(PLURAL_SUFFIX);
  return match ? key.slice(0, -match[0].length) : null;
};

const variables = (value: string): string[] =>
  [...value.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]);

const pluralCategories = (locale: string): string[] => {
  try {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  } catch {
    return new Intl.PluralRules(locale.split("-")[0]).resolvedOptions().pluralCategories;
  }
};

const sourceFiles = (): string[] => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== LOCALES_DIR) walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  walk(SRC_DIR);
  return files;
};

const enUSFlat = flatten(loadCatalog("en-US"));
const enUSKeys = Object.keys(enUSFlat);

const enUSPluralBases = new Set(
  enUSKeys
    .map(pluralBase)
    .filter((base): base is string => base !== null && enUSFlat[`${base}_other`] !== undefined),
);

const pluralSuffixes = (keys: string[]): string[] =>
  keys.flatMap((key) => {
    const base = pluralBase(key);
    return base && enUSPluralBases.has(base) ? [key.slice(base.length + 1)] : [];
  });

const nonPluralKeys = (keys: string[]): string[] =>
  keys.filter((key) => {
    const base = pluralBase(key);
    return !(base && enUSPluralBases.has(base));
  });

describe("locale catalogs", () => {
  it("ships exactly the supported locales", () => {
    const entries = fs.readdirSync(LOCALES_DIR);
    expect(entries.length).toBe(SUPPORTED_LOCALES.length);
    expect(entries.map((name) => name.replace(/\.json$/, "")).sort()).toEqual(
      [...SUPPORTED_LOCALES].sort(),
    );
  });

  it("keeps the en-US key set and one plural form per locale category", () => {
    const enUSNonPlural = nonPluralKeys(enUSKeys).sort();
    for (const locale of SUPPORTED_LOCALES) {
      const keys = Object.keys(flatten(loadCatalog(locale)));
      expect(pluralSuffixes(keys).sort(), locale).toEqual([...pluralCategories(locale)].sort());
      expect(nonPluralKeys(keys).sort(), locale).toEqual(enUSNonPlural);
    }
  });

  it("stores only non-empty strings", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(flatten(loadCatalog(locale)))) {
        expect(typeof value, `${locale}:${key}`).toBe("string");
        expect(String(value).trim(), `${locale}:${key}`).not.toBe("");
      }
    }
  });

  it("uses only interpolation variables declared in en-US", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(flatten(loadCatalog(locale)))) {
        if (typeof value !== "string") continue;
        const base = pluralBase(key);
        const enKey = base && enUSPluralBases.has(base) ? `${base}_other` : key;
        const reference = enUSFlat[enKey];
        if (typeof reference !== "string") {
          throw new Error(`${locale}:${key} has no en-US reference`);
        }
        const allowed = variables(reference);
        expect(
          variables(value).filter((name) => !allowed.includes(name)),
          `${locale}:${key}`,
        ).toEqual([]);
      }
    }
  });

  it("declares every en-US interpolation variable in the plural _other form", () => {
    for (const base of enUSPluralBases) {
      const other = enUSFlat[`${base}_other`];
      if (typeof other !== "string") throw new Error(`${base}_other is not a string`);
      const otherVariables = variables(other);
      const used = new Set(
        Object.entries(enUSFlat)
          .filter(([key]) => pluralBase(key) === base)
          .flatMap(([, value]) => (typeof value === "string" ? variables(value) : [])),
      );
      used.delete("count");
      expect([...used].filter((name) => !otherVariables.includes(name)), base).toEqual([]);
    }
  });

  it("only translates keys that exist in en-US", () => {
    const missing: string[] = [];
    for (const file of sourceFiles()) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bt\(\s*(["'`])([^"'`\n]+)\1\s*[,)]/g)) {
        const key = match[2];
        if (key.includes("${")) continue;
        if (enUSFlat[key] === undefined && enUSFlat[`${key}_other`] === undefined) {
          missing.push(`${path.relative(SRC_DIR, file)}: ${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
