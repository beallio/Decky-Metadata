import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { LITERAL_ALLOWLIST } from "./literalAllowlist";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT_DIR = path.resolve(SRC_DIR, "..");
const EXCLUDED_DIRS = new Set([path.join(SRC_DIR, "i18n"), path.join(SRC_DIR, "locales")]);

const TEXT_ATTRIBUTES = [
  "label",
  "description",
  "title",
  "strTitle",
  "strDescription",
  "strOKButtonText",
  "strCancelButtonText",
  "placeholder",
  "aria-label",
];
const TOAST_FUNCTIONS = ["toastError", "toastSuccess", "toastInfo", "showToast"];

const LATIN_LETTER = /[A-Za-z]/;
const LATIN_WORD = /[A-Za-z]{2,}/;
const URL_START = /^https?:\/\//;
const PLACEHOLDERS_ONLY = /^(?:\{\{\s*[\w.]+\s*\}\}\s*)+$/;

/**
 * Whether a raw text still needs `t()`. Brand names only exempt a whole literal value: a template
 * head such as `"ProtonDB "` belongs to a larger sentence and stays translatable.
 */
const needsTranslation = (text: string, latin: RegExp, allowBrandName: boolean): boolean => {
  const value = text.trim();
  if (allowBrandName && LITERAL_ALLOWLIST.includes(value)) return false;
  if (URL_START.test(value) || PLACEHOLDERS_ONLY.test(value)) return false;
  // Punctuation, symbols and digits carry no Latin letters, so this also covers them.
  return latin.test(value);
};

type Candidate = { node: ts.Node; text: string; allowBrandName: boolean };

const literalCandidates = (expression: ts.Expression): Candidate[] => {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return [{ node: expression, text: expression.text, allowBrandName: true }];
  }
  if (ts.isTemplateExpression(expression)) {
    return [expression.head, ...expression.templateSpans.map((span) => span.literal)].map(
      (node) => ({ node, text: node.text, allowBrandName: false }),
    );
  }
  return [];
};

/** Follows `a ? "x" : "y"`, `a ?? "x"` and `a || "x"` so every literal branch is checked. */
const branchExpressions = (expression: ts.Expression): ts.Expression[] => {
  if (ts.isParenthesizedExpression(expression)) return branchExpressions(expression.expression);
  if (ts.isConditionalExpression(expression)) {
    return [
      ...branchExpressions(expression.whenTrue),
      ...branchExpressions(expression.whenFalse),
    ];
  }
  if (ts.isBinaryExpression(expression)) {
    const kind = expression.operatorToken.kind;
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      return [...branchExpressions(expression.left), ...branchExpressions(expression.right)];
    }
  }
  return [expression];
};

const calleeName = (callee: ts.Expression): string => {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return "";
};

/** Returns `file:line: text` for every raw user-facing string in one source text. */
export const scanSource = (fileName: string, source: string): string[] => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const violations: string[] = [];

  const report = (node: ts.Node): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const text = node.getText(sourceFile).replace(/\s+/g, " ").trim();
    violations.push(`${fileName}:${line}: ${text}`);
  };

  const reportLiterals = (expression: ts.Expression): void => {
    for (const branch of branchExpressions(expression)) {
      for (const candidate of literalCandidates(branch)) {
        if (needsTranslation(candidate.text, LATIN_WORD, candidate.allowBrandName)) {
          report(candidate.node);
        }
      }
    }
  };

  const scanAttribute = (node: ts.JsxAttribute): void => {
    const name = node.name.getText(sourceFile);
    if (!TEXT_ATTRIBUTES.includes(name) || !node.initializer) return;
    if (ts.isJsxExpression(node.initializer)) {
      if (node.initializer.expression) reportLiterals(node.initializer.expression);
    } else if (
      ts.isStringLiteral(node.initializer) &&
      needsTranslation(node.initializer.text, LATIN_WORD, true)
    ) {
      report(node.initializer);
    }
  };

  const scanCall = (node: ts.CallExpression): void => {
    const callee = calleeName(node.expression);
    if (TOAST_FUNCTIONS.includes(callee)) {
      for (const argument of node.arguments.slice(0, 2)) reportLiterals(argument);
    }
    for (const argument of node.arguments) {
      if (!ts.isObjectLiteralExpression(argument)) continue;
      for (const property of argument.properties) {
        if (!ts.isPropertyAssignment(property)) continue;
        const name =
          ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
            ? property.name.text
            : "";
        // Decky toasts take a heading plus a body; decky/ui fields take their own label/description.
        if (TEXT_ATTRIBUTES.includes(name) || (callee === "toast" && name === "body")) {
          reportLiterals(property.initializer);
        }
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      if (needsTranslation(node.text, LATIN_LETTER, true)) report(node);
    } else if (ts.isJsxAttribute(node)) {
      scanAttribute(node);
    } else if (ts.isCallExpression(node)) {
      scanCall(node);
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return violations;
};

const sourceFiles = (): string[] => {
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(full)) walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.test\.tsx?$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) continue;
      files.push(full);
    }
  };
  walk(SRC_DIR);
  return files;
};

describe("hardcoded user-facing text", () => {
  it("goes through the translator", () => {
    const violations = sourceFiles().flatMap((file) =>
      scanSource(path.relative(ROOT_DIR, file), fs.readFileSync(file, "utf8")),
    );
    expect(violations).toEqual([]);
  });
});

describe("literal scanner", () => {
  it("reports raw JSX text, attribute strings and toast strings", () => {
    const violations = scanSource(
      "fixture.tsx",
      `
const view = (
  <>
    <div>Hello</div>
    <Field label="Save" />
    <Field label={t("a.b")} />
    <span>ProtonDB</span>
  </>
);
toastError("Save failed", x);
`,
    );

    expect(violations).toHaveLength(3);
    expect(violations[0]).toMatch(/^fixture\.tsx:\d+: Hello$/);
    expect(violations.some((violation) => violation.includes('"Save"'))).toBe(true);
    expect(violations.some((violation) => violation.includes('"Save failed"'))).toBe(true);
  });

  it("ignores brand names, placeholders, URLs and punctuation", () => {
    expect(scanSource("fixture.tsx", `const view = <span>ProtonDB</span>;`)).toEqual([]);
    expect(
      scanSource(
        "fixture.tsx",
        `
const a = <Field label="Steam" />;
const b = <Field label="{{name}}" />;
const c = <PanelSection title="https://example.com" />;
const d = <span>·</span>;
`,
      ),
    ).toEqual([]);
  });
});
