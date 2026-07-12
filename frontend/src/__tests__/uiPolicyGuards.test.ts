/* @vitest-environment node */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localeRoot = path.join(sourceRoot, "i18n", "locales");

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__" || entry.name === "i18n") return [];
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(absolutePath);
    return /\.(ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, nested]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(nested, nextPrefix);
  });
}

describe("production UI policy guards", () => {
  const sourceFiles = collectSourceFiles(sourceRoot);

  it("does not use browser alert or confirm APIs", () => {
    const violations = sourceFiles.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /\b(?:window\.)?(?:alert|confirm)\s*\(/.test(source)
        ? [path.relative(sourceRoot, file)]
        : [];
    });
    expect(violations).toEqual([]);
  });

  it("keeps user-facing CJK copy in locale resources", () => {
    const violations: string[] = [];
    const languageDataFiles = new Set([
      "components/dialogs/synthesis/fontUtils.ts",
      "utils/textSplitter.ts",
    ]);
    for (const file of sourceFiles.filter((candidate) => candidate.endsWith(".tsx"))) {
      const relativeFile = path.relative(sourceRoot, file).replaceAll("\\", "/");
      if (languageDataFiles.has(relativeFile)) continue;
      const source = fs.readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node) => {
        if (
          (ts.isStringLiteralLike(node) || ts.isJsxText(node)) &&
          /[\u3400-\u9fff]/.test(node.text)
        ) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          violations.push(`${relativeFile}:${line}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it("does not hardcode accessible labels, titles, placeholders, or image alt text", () => {
    const violations: string[] = [];
    const checkedAttributes = new Set(["title", "aria-label", "placeholder", "alt"]);
    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (
          ts.isJsxAttribute(node) &&
          checkedAttributes.has(node.name.getText(sourceFile)) &&
          node.initializer &&
          ts.isStringLiteral(node.initializer) &&
          node.initializer.text !== "" &&
          node.initializer.text !== "MediaFlow"
        ) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          violations.push(`${path.relative(sourceRoot, file)}:${line}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it("keeps production copy at a readable minimum size and contrast", () => {
    const violations: string[] = [];
    const prohibitedTextClasses = /text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]|text-slate-(?:[5-9]00)(?:\/\d+)?|text-slate-\d00\/\d+|placeholder(?::text)?-slate-(?:500|600)(?:\/\d+)?/g;
    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      for (const match of source.matchAll(prohibitedTextClasses)) {
        const line = source.slice(0, match.index).split("\n").length;
        violations.push(`${path.relative(sourceRoot, file)}:${line}:${match[0]}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps UI configuration labels and descriptions localized", () => {
    const violations: string[] = [];
    const technicalLabel = /^\d{3,4}p(?: \(HD\))?$/;
    const uiSourceFiles = sourceFiles.filter((file) => {
      const relative = path.relative(sourceRoot, file).replaceAll("\\", "/");
      return relative.startsWith("components/") || relative.startsWith("pages/");
    });

    for (const file of uiSourceFiles) {
      const source = fs.readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isPropertyAssignment(node) &&
          (node.name.getText(sourceFile) === "label" ||
            node.name.getText(sourceFile) === "description") &&
          ts.isStringLiteralLike(node.initializer) &&
          node.initializer.text !== "" &&
          !technicalLabel.test(node.initializer.text)
        ) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          violations.push(`${path.relative(sourceRoot, file)}:${line}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }
    expect(violations).toEqual([]);
  });

  it("keeps every locale namespace key-compatible with English", () => {
    const languages = ["en", "zh", "ja"];
    const namespaceFiles = fs.readdirSync(path.join(localeRoot, "en")).sort();
    for (const language of languages) {
      expect(fs.readdirSync(path.join(localeRoot, language)).sort()).toEqual(namespaceFiles);
    }

    for (const namespaceFile of namespaceFiles) {
      const expected = flattenKeys(JSON.parse(
        fs.readFileSync(path.join(localeRoot, "en", namespaceFile), "utf8"),
      )).sort();
      for (const language of languages.slice(1)) {
        const actual = flattenKeys(JSON.parse(
          fs.readFileSync(path.join(localeRoot, language, namespaceFile), "utf8"),
        )).sort();
        expect(actual, `${language}/${namespaceFile}`).toEqual(expected);
      }
    }
  });

  it("keeps locale resources on one loading path", () => {
    const directLocaleImports = sourceFiles.flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /(?:from\s*|import\s*\()\s*["'][^"']*i18n\/locales\//.test(source)
        ? [path.relative(sourceRoot, file)]
        : [];
    });
    expect(directLocaleImports).toEqual([]);

    const loaderSource = fs.readFileSync(path.join(localeRoot, "..", "index.ts"), "utf8");
    expect(loaderSource).toContain('"./locales/zh/*.json"');
    expect(loaderSource).toContain('"!./locales/zh/common.json"');
    expect(loaderSource).toContain('"./locales/zh/common.json"');
    expect(loaderSource).not.toContain('"./locales/*/*.json"');
  });
});
