import fs from "node:fs";
import https from "node:https";
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
const DEFAULT_REPO = "EloiseCry/ciclope-mitologias-verbales";
const DEFAULT_REVISION = "main";
const DEFAULT_INCLUDE_PREFIX = "TSR_EDITORIAL/";
const DEFAULT_MAX_FILES = 120;
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "runtime", "knowledge", "ciclope", "raw");
const MANIFEST_PATH = path.join(PROJECT_ROOT, "runtime", "knowledge", "ciclope", "manifest.json");

function splitRepo(repo) {
  const parts = String(repo).split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error("repo invalido. Usa formato owner/dataset");
  }
  return { owner: parts[0], dataset: parts[1] };
}

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    revision: DEFAULT_REVISION,
    includePrefix: DEFAULT_INCLUDE_PREFIX,
    maxFiles: DEFAULT_MAX_FILES,
    dryRun: false,
    token: process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN ?? process.env.HUGGINGFACEHUB_API_TOKEN ?? null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--repo") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --repo");
      args.repo = next;
      i += 1;
      continue;
    }
    if (token === "--revision") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --revision");
      args.revision = next;
      i += 1;
      continue;
    }
    if (token === "--include-prefix") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --include-prefix");
      args.includePrefix = next;
      i += 1;
      continue;
    }
    if (token === "--max-files") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --max-files");
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("max-files invalido");
      }
      args.maxFiles = parsed;
      i += 1;
      continue;
    }
    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (token === "--token") {
      const next = argv[i + 1];
      if (!next) throw new Error("Falta valor despues de --token");
      args.token = next;
      i += 1;
      continue;
    }
  }

  return args;
}

function requestRaw(url, { responseType = "text", redirects = 3, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const status = response.statusCode ?? 0;

      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirects <= 0) {
          reject(new Error(`Demasiadas redirecciones para ${url}`));
          return;
        }
        const location = new URL(response.headers.location, url).toString();
        requestRaw(location, { responseType, redirects: redirects - 1, headers }).then(resolve).catch(reject);
        return;
      }

      if (status < 200 || status >= 300) {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const detail = Buffer.concat(chunks).toString("utf8");
          reject(new Error(`HTTP ${status} en ${url}. ${detail.slice(0, 400)}`));
        });
        return;
      }

      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        if (responseType === "buffer") {
          resolve(buffer);
          return;
        }
        resolve(buffer.toString("utf8"));
      });
    });

    request.on("error", reject);
  });
}

function normalizeLocalPath(relativePath) {
  const normalized = String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Ruta remota insegura: ${relativePath}`);
  }
  return normalized;
}

function toResolveUrl({ owner, dataset, revision, remotePath }) {
  const encodedRevision = encodeURIComponent(revision);
  const encodedPath = remotePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://huggingface.co/datasets/${owner}/${dataset}/resolve/${encodedRevision}/${encodedPath}`;
}

function toApiUrl({ owner, dataset }) {
  return `https://huggingface.co/api/datasets/${owner}/${dataset}`;
}

export async function syncCiclopeDataset(options = {}) {
  const args = {
    repo: options.repo ?? DEFAULT_REPO,
    revision: options.revision ?? DEFAULT_REVISION,
    includePrefix: options.includePrefix ?? DEFAULT_INCLUDE_PREFIX,
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
    dryRun: Boolean(options.dryRun),
    token: options.token ?? process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN ?? process.env.HUGGINGFACEHUB_API_TOKEN ?? null
  };
  const headers = args.token ? { Authorization: `Bearer ${args.token}` } : {};

  const { owner, dataset } = splitRepo(args.repo);
  const metadataRaw = await requestRaw(toApiUrl({ owner, dataset }), { responseType: "text", headers });
  const metadata = JSON.parse(metadataRaw);
  const siblings = Array.isArray(metadata.siblings) ? metadata.siblings : [];

  const selected = siblings
    .map((entry) => entry?.rfilename)
    .filter((name) => typeof name === "string")
    .filter((name) => name.toLowerCase().endsWith(".md"))
    .filter((name) => name.startsWith(args.includePrefix))
    .sort((a, b) => a.localeCompare(b, "es"))
    .slice(0, args.maxFiles);

  const fetchedAt = new Date().toISOString();
  if (!args.dryRun) {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  }

  const downloaded = [];
  for (const remotePath of selected) {
    const safeRelative = normalizeLocalPath(remotePath);
    const localPath = path.join(OUTPUT_ROOT, safeRelative);

    if (!args.dryRun) {
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      const url = toResolveUrl({ owner, dataset, revision: args.revision, remotePath: safeRelative });
      const buffer = await requestRaw(url, { responseType: "buffer", headers });
      fs.writeFileSync(localPath, buffer);
    }

    downloaded.push(safeRelative);
  }

  const summary = {
    status: args.dryRun ? "dry_run" : "synced",
    source: {
      repo: args.repo,
      revision: args.revision,
      dataset_sha: metadata.sha ?? null
    },
    filter: {
      includePrefix: args.includePrefix,
      maxFiles: args.maxFiles
    },
    totals: {
      siblings: siblings.length,
      selected: selected.length
    },
    fetched_at: fetchedAt,
    files: downloaded
  };

  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(summary, null, 2));
  }

  return summary;
}

async function runCli() {
  const args = parseArgs(process.argv.slice(2));
  const result = await syncCiclopeDataset(args);
  console.log(`Ciclope sync status: ${result.status}`);
  console.log(`Repo: ${result.source.repo}@${result.source.revision}`);
  console.log(`Seleccionados: ${result.totals.selected}/${result.totals.siblings}`);
  if (result.status === "synced") {
    console.log(`Manifest: ${MANIFEST_PATH}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runCli().catch((error) => {
    console.error("Ciclope sync failed");
    console.error(error);
    process.exitCode = 1;
  });
}
