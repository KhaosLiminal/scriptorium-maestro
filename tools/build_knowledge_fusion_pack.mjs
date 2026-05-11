import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findProjectRoot(startPath = __dirname) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, "package.json"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startPath);
}

const PROJECT_ROOT = findProjectRoot(__dirname);
const CICLOPE_DIR = path.join(PROJECT_ROOT, "runtime", "knowledge", "ciclope", "raw");
const NOTION_DIR = path.join(PROJECT_ROOT, "integrations", "notion_export", "kraken_liminal_lab");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "runtime", "knowledge", "fusion");
const OUTPUT_JSON = path.join(OUTPUT_DIR, "fusion_pack.json");
const OUTPUT_PROMPT = path.join(OUTPUT_DIR, "fusion_prompt.md");

function parseArgs(argv) {
  const args = {
    ciclopeDir: CICLOPE_DIR,
    notionDir: NOTION_DIR,
    outputDir: OUTPUT_DIR,
    maxCiclope: 60,
    maxNotion: 40
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--ciclope-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --ciclope-dir");
      args.ciclopeDir = path.resolve(PROJECT_ROOT, next);
      i += 1;
      continue;
    }
    if (token === "--notion-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --notion-dir");
      args.notionDir = path.resolve(PROJECT_ROOT, next);
      i += 1;
      continue;
    }
    if (token === "--output-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --output-dir");
      args.outputDir = path.resolve(PROJECT_ROOT, next);
      i += 1;
      continue;
    }
    if (token === "--max-ciclope") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --max-ciclope");
      args.maxCiclope = parsePositiveInt(next, "max-ciclope");
      i += 1;
      continue;
    }
    if (token === "--max-notion") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --max-notion");
      args.maxNotion = parsePositiveInt(next, "max-notion");
      i += 1;
      continue;
    }
  }
  return args;
}

function parsePositiveInt(raw, name) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} invalido`);
  }
  return value;
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeWhitespace(value) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function extractTitle(text, filePath) {
  const lines = text.split(/\r?\n/);
  const heading = lines.find((line) => line.trim().startsWith("#"));
  if (heading) return heading.replace(/^#+\s*/, "").trim();
  return path.basename(filePath, path.extname(filePath));
}

function pickExcerpt(text, maxChars = 480) {
  const normalized = normalizeWhitespace(text);
  return normalized.slice(0, maxChars);
}

function sourceTagFromPath(fullPath, baseDir) {
  const relative = path.relative(baseDir, fullPath).replace(/\\/g, "/");
  const chunks = relative.split("/").slice(0, -1);
  if (chunks.length === 0) return [];
  return chunks.slice(0, 3).map((chunk) => chunk.toLowerCase().replace(/[^a-z0-9_-]+/g, "_"));
}

function loadTextCards(baseDir, sourceId, maxDocs) {
  const files = walkFiles(baseDir)
    .filter((fullPath) => /\.(md|txt)$/i.test(fullPath))
    .sort((a, b) => a.localeCompare(b, "es"))
    .slice(0, maxDocs);

  return files.map((fullPath, index) => {
    const raw = fs.readFileSync(fullPath, "utf8");
    const excerpt = pickExcerpt(raw);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
    return {
      id: `${sourceId}-${String(index + 1).padStart(4, "0")}`,
      source: sourceId,
      relative_path: relativePath,
      title: extractTitle(raw, fullPath),
      tags: sourceTagFromPath(fullPath, baseDir),
      excerpt,
      char_count: raw.length
    };
  });
}

function buildPrompt(ciclopeCards, notionCards) {
  const header = [
    "# Scriptorium Fusion Prompt",
    "",
    "Usa este material para producir literatura hibrida alineada a Reflejos Hibridos.",
    "Reglas:",
    "- No inventes fuentes fuera del pack.",
    "- Cruza al menos 2 fragmentos de Ciclope y 1 del Kraken/Notion.",
    "- Conserva tono critico, poetico-disciplinado y densidad conceptual alta.",
    "- Entrega texto final y una traza de fuentes utilizadas (ids).",
    ""
  ].join("\n");

  function renderCards(title, cards) {
    const lines = [title, ""];
    for (const card of cards) {
      lines.push(`## ${card.id} | ${card.title}`);
      lines.push(`source: ${card.source}`);
      lines.push(`path: ${card.relative_path}`);
      lines.push(`excerpt: ${card.excerpt}`);
      lines.push("");
    }
    return lines.join("\n");
  }

  return [
    header,
    renderCards("## Corpus Ciclope", ciclopeCards),
    renderCards("## Corpus Kraken (Notion export)", notionCards)
  ].join("\n");
}

export function buildKnowledgeFusionPack(options = {}) {
  const ciclopeDir = path.resolve(options.ciclopeDir ?? CICLOPE_DIR);
  const notionDir = path.resolve(options.notionDir ?? NOTION_DIR);
  const outputDir = path.resolve(options.outputDir ?? OUTPUT_DIR);
  const maxCiclope = options.maxCiclope ?? 60;
  const maxNotion = options.maxNotion ?? 40;

  const ciclopeCards = loadTextCards(ciclopeDir, "ciclope", maxCiclope);
  const notionCards = loadTextCards(notionDir, "kraken_notion", maxNotion);
  const generatedAt = new Date().toISOString();

  const payload = {
    generated_at: generatedAt,
    sources: {
      ciclope_dir: ciclopeDir,
      notion_dir: notionDir
    },
    totals: {
      ciclope: ciclopeCards.length,
      notion: notionCards.length,
      total: ciclopeCards.length + notionCards.length
    },
    cards: [...ciclopeCards, ...notionCards]
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, path.basename(OUTPUT_JSON)), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(outputDir, path.basename(OUTPUT_PROMPT)), buildPrompt(ciclopeCards, notionCards));

  return {
    outputDir,
    totals: payload.totals,
    jsonPath: path.join(outputDir, path.basename(OUTPUT_JSON)),
    promptPath: path.join(outputDir, path.basename(OUTPUT_PROMPT))
  };
}

function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = buildKnowledgeFusionPack(args);
  console.log("Knowledge fusion pack OK");
  console.log(`Cards: ${result.totals.total} (ciclope=${result.totals.ciclope}, notion=${result.totals.notion})`);
  console.log(`JSON: ${result.jsonPath}`);
  console.log(`PROMPT: ${result.promptPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    runCli();
  } catch (error) {
    console.error("Knowledge fusion pack failed");
    console.error(error);
    process.exitCode = 1;
  }
}
