import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArc } from "../parser/index.js";
import actions from "../actions/index.js";
import { exportToCapCut } from "../exporters/capcut_exporter.js";
import { processVoices } from "../preexport/voice_pipeline.js";
import { findProjectRoot, getMediaCatalogEntry } from "../media/catalog.js";
import { getReplacementHint } from "../media/replacements.js";
import { observe } from "../orchestrator/observer.js";

function resolveArcReference(relativeFile, ritual, options = {}) {
  const projectRoot =
    options.projectRoot ||
    findProjectRoot(ritual.filePath ? path.dirname(ritual.filePath) : process.cwd());
  const ritualDir = ritual.filePath ? path.dirname(ritual.filePath) : projectRoot;
  const candidate = String(relativeFile || "");

  if (path.isAbsolute(candidate)) return candidate;

  const projectStylePrefixes = [
    "pipelines/",
    "arc/",
    "canon/",
    "engine/",
    "integrations/",
    "assets/",
    "audio/",
    "runtime/"
  ];

  if (projectStylePrefixes.some(prefix => candidate.startsWith(prefix))) {
    return path.resolve(projectRoot, candidate);
  }

  return path.resolve(ritualDir, candidate);
}

function getByDottedPath(target, ref) {
  if (!target || typeof ref !== "string") return undefined;
  return ref.split(".").reduce((current, part) => {
    if (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, part)) {
      return current[part];
    }
    return undefined;
  }, target);
}

function resolveAssetRef(value, ritual) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  return ritual.assets?.[value] ?? getByDottedPath(ritual.assets, value) ?? value;
}

function resolveStyleRef(value, ritual) {
  if (value === null || value === undefined) return {};
  if (typeof value !== "string") return value;
  return ritual.styles?.[value] ?? getByDottedPath(ritual.styles, value) ?? { ref: value };
}

function normalizeTimeValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value > 120 ? value / 1000 : value;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^-?\d+(\.\d+)?ms$/i.test(trimmed)) return Number(trimmed.replace(/ms$/i, "")) / 1000;
  if (/^-?\d+(\.\d+)?s$/i.test(trimmed)) return Number(trimmed.replace(/s$/i, ""));
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return numeric > 120 ? numeric / 1000 : numeric;
  }

  return null;
}

function pickRootAudioRef(ritual) {
  const candidates = [
    ritual.assets?.audio,
    ritual.assets?.audio_main,
    ritual.meta?.audio
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }

  return null;
}

function estimateTimelineDuration(ritual) {
  return (ritual.timeline || []).reduce((maxEnd, item) => {
    const start = normalizeTimeValue(item.start);
    const duration = normalizeTimeValue(item.duration);
    const end = normalizeTimeValue(item.end);
    const itemEnd =
      typeof end === "number"
        ? end
        : typeof start === "number" && typeof duration === "number"
          ? start + duration
          : 0;
    return Math.max(maxEnd, itemEnd);
  }, 0);
}

export function createRuntimeContext(initial = {}) {
  const media = {
    present: [],
    missing: [],
    hydrated: [],
    placeholder: [],
    declaredMissing: [],
    uncatalogued: [],
    replacementHints: [],
    ...(initial.media ?? {})
  };

  return {
    state: initial.state ?? {},
    logs: initial.logs ?? [],
    timeline: initial.timeline ?? [],
    cursor: initial.cursor ?? 0,
    invocations: initial.invocations ?? [],
    files: initial.files ?? [],
    media
  };
}

function pushUnique(target, value) {
  if (!target.includes(value)) target.push(value);
}

function pushReplacementHint(ctx, hint) {
  if (!hint) return;
  const exists = ctx.media.replacementHints.some(entry => entry.ref === hint.ref);
  if (!exists) ctx.media.replacementHints.push(hint);
}

function registerMediaRef(ref, ctx, options = {}) {
  if (typeof ref !== "string") return;
  if (
    !ref.startsWith("assets/") &&
    !ref.startsWith("audio/") &&
    !ref.startsWith("pipelines/capcut_pack/") &&
    !ref.startsWith("runtime/")
  ) {
    return;
  }

  const projectRoot = options.projectRoot || process.cwd();
  const absolutePath = path.join(projectRoot, ref);
  const exists = fs.existsSync(absolutePath);
  const catalogEntry = getMediaCatalogEntry(ref, projectRoot);
  const state = catalogEntry?.state ?? null;
  const bucket = exists ? ctx.media.present : ctx.media.missing;
  pushUnique(bucket, ref);

  if (exists) {
    if (state === "evidence_hydrated") pushUnique(ctx.media.hydrated, ref);
    return;
  }

  const replacementHint = state === "placeholder_missing"
    ? getReplacementHint(ref, projectRoot)
    : null;

  if (state === "placeholder_missing") {
    pushUnique(ctx.media.placeholder, ref);
    pushReplacementHint(ctx, replacementHint);
  }
  else if (state === "declared_missing_final") pushUnique(ctx.media.declaredMissing, ref);
  else pushUnique(ctx.media.uncatalogued, ref);

  if (!exists) {
    const suffix = state === "placeholder_missing" && replacementHint
      ? ` [${state} slot=${replacementHint.slot}]`
      : state
        ? ` [${state}]`
        : " [uncatalogued_missing]";
    const alreadyLogged = ctx.logs.some(
      entry =>
        entry.type === "warning" &&
        entry.text === `Media faltante: ${ref}${suffix}`
    );
    if (!alreadyLogged) {
      ctx.logs.push({
        type: "warning",
        text: `Media faltante: ${ref}${suffix}`,
        at: ctx.cursor
      });
    }
  }
}

function appendClip(ctx, clip) {
  ctx.timeline.push(clip);
  if (typeof clip.start === "number" && typeof clip.duration === "number") {
    ctx.cursor = Math.max(ctx.cursor, clip.start + clip.duration);
  }
  return clip;
}

async function runStepsRitual(ritual, ctx) {
  const startCursor = ctx.cursor;

  for (const step of ritual.steps || []) {
    ctx.logs.push({ type: "step", name: step.name, at: ctx.cursor });

    for (const action of step.actions || []) {
      const fn = actions[action.type];
      if (!fn) {
        ctx.logs.push({
          type: "warning",
          text: `Accion desconocida: ${action.type}`,
          at: ctx.cursor
        });
        continue;
      }

      await fn(action.args || {}, ctx, ritual);
    }
  }

  return {
    start: startCursor,
    end: ctx.cursor,
    duration: ctx.cursor - startCursor
  };
}

function materializeTimelineSegment(segment, ritual, offset = 0) {
  const start = (normalizeTimeValue(segment.start) ?? 0) + offset;
  const rawDuration = normalizeTimeValue(segment.duration);
  const rawEnd = normalizeTimeValue(segment.end);
  const duration =
    rawDuration ??
    (typeof rawEnd === "number" && typeof normalizeTimeValue(segment.start) === "number"
      ? rawEnd - normalizeTimeValue(segment.start)
      : 0);
  const props = segment.props || {};
  const clips = [];
  const baseStyle = { ...(ritual.styles || {}) };

  if (segment.track === "video" || segment.source === "escena") {
    const visualSrc = resolveAssetRef(
      props.src ?? props.img ?? props.image ?? props.media ?? props.video ?? null,
      ritual
    );
    if (visualSrc) {
      clips.push({
        type: "clip",
        clipType: props.video ? "video" : "image",
        src: visualSrc,
        start,
        duration,
        layer: Number(props.visual_layer ?? props.layer ?? 1),
        style: {
          ...baseStyle,
          transition: props.transicion ?? null,
          zoom: props.zoom ?? null
        }
      });
    }

    return {
      clips,
      end: start + duration
    };
  }

  if (segment.track === "texto" || segment.source === "caption") {
    const text = props.contenido ?? props.text ?? props.caption ?? null;
    if (text) {
      clips.push({
        type: "clip",
        clipType: "text",
        value: String(text),
        start,
        duration,
        layer: Number(props.text_layer ?? 2),
        style: {
          ...baseStyle,
          ...resolveStyleRef(props.style, ritual)
        }
      });
    }

    return {
      clips,
      end: start + duration
    };
  }

  if (segment.track === "audio" || segment.source === "layer") {
    const audioSrc = resolveAssetRef(props.src ?? props.audio ?? null, ritual);
    const audioDuration =
      duration ||
      normalizeTimeValue(ritual.meta.duration ?? ritual.meta.duracion) ||
      estimateTimelineDuration(ritual);
    if (audioSrc) {
      clips.push({
        type: "audio",
        clipType: "audio",
        src: audioSrc,
        start,
        duration: audioDuration,
        layer: Number(props.audio_layer ?? props.layer ?? 0),
        volume: props.volumen ?? props.volume ?? 1
      });
    }

    return {
      clips,
      end: start + audioDuration
    };
  }

  const visualSrc = resolveAssetRef(
    props.img ?? props.image ?? props.media ?? props.video ?? null,
    ritual
  );
  if (visualSrc) {
    clips.push({
      type: "clip",
      clipType: props.video ? "video" : "image",
      src: visualSrc,
      start,
      duration,
      layer: Number(props.visual_layer ?? props.layer ?? 1),
      style: baseStyle
    });
  }

  const text = props.text ?? props.caption ?? props.contenido ?? null;
  if (text) {
    clips.push({
      type: "clip",
      clipType: "text",
      value: String(text),
      start,
      duration,
      layer: Number(props.text_layer ?? 2),
      style: {
        ...baseStyle,
        ...resolveStyleRef(props.style ?? props.caption_style, ritual)
      }
    });
  }

  const audioSrc = resolveAssetRef(props.audio ?? null, ritual);
  if (audioSrc) {
    clips.push({
      type: "audio",
      clipType: "audio",
      src: audioSrc,
      start,
      duration,
      layer: Number(props.audio_layer ?? 0)
    });
  }

  const voiceText = props.voice ?? props.narration ?? null;
  if (voiceText) {
    clips.push({
      kind: "voice",
      type: "voice",
      text: String(voiceText),
      voice: String(props.voice_name ?? "es-MX-JorgeNeural"),
      start,
      duration,
      layer: Number(props.voice_layer ?? 0),
      subtitles: props.subtitles !== false
    });
  }

  return {
    clips,
    end: start + duration
  };
}

async function runTimelineRitual(ritual, ctx, options = {}) {
  const offset = options.offset ?? ctx.cursor;
  const ritualDuration =
    normalizeTimeValue(ritual.meta.duration ?? ritual.meta.duracion) ??
    estimateTimelineDuration(ritual);
  let maxEnd = offset;
  let actionCursor = offset;

  const rootAudio = pickRootAudioRef(ritual);
  if (rootAudio) {
    registerMediaRef(rootAudio, ctx, options);
    const clip = appendClip(ctx, {
      type: "audio",
      clipType: "audio",
      src: resolveAssetRef(rootAudio, ritual),
      start: offset,
      duration: ritualDuration,
      layer: 0
    });
    maxEnd = Math.max(maxEnd, clip.start + clip.duration);
  }

  for (const item of ritual.timeline || []) {
    if (item.kind === "action" && item.action) {
      const fn = actions[item.action.type];
      if (!fn) {
        ctx.logs.push({
          type: "warning",
          text: `Accion desconocida en timeline: ${item.action.type}`,
          at: actionCursor
        });
        continue;
      }

      ctx.cursor = actionCursor;
      await fn(item.action.args || {}, ctx, ritual);
      actionCursor = ctx.cursor;
      maxEnd = Math.max(maxEnd, actionCursor);
      continue;
    }

    const { clips, end } = materializeTimelineSegment(item, ritual, offset);
    clips.forEach(clip => {
      if (typeof clip.src === "string") registerMediaRef(clip.src, ctx, options);
      appendClip(ctx, clip);
    });
    maxEnd = Math.max(maxEnd, end);
  }

  const end = Math.max(offset + ritualDuration, maxEnd);
  ctx.cursor = Math.max(ctx.cursor, end);

  return {
    start: offset,
    end,
    duration: ritualDuration
  };
}

async function runSequenceRitual(ritual, ctx, options = {}) {
  const startCursor = ctx.cursor;
  const ancestry = options.ancestry ?? [];

  for (const item of ritual.sequence || []) {
    const relativeFile =
      item.props?.file ??
      item.props?.include ??
      item.props?.incluye ??
      item.props?.path ??
      null;

    if (!relativeFile) {
      ctx.logs.push({
        type: "warning",
        text: `Secuencia sin archivo: ${item.name}`,
        at: ctx.cursor
      });
      continue;
    }

    const resolvedFile = resolveArcReference(relativeFile, ritual, options);
    await runArcFile(resolvedFile, {
      context: ctx,
      offset: ctx.cursor,
      ancestry,
      projectRoot: options.projectRoot
    });
  }

  return {
    start: startCursor,
    end: ctx.cursor,
    duration: ctx.cursor - startCursor
  };
}

export async function executeRitual(ritual, options = {}) {
  const ctx = options.context ?? createRuntimeContext();
  const ancestry = options.ancestry ?? [];

  if (ritual.filePath) {
    if (ancestry.includes(ritual.filePath)) {
      throw new Error(`Ciclo detectado en secuencia ARC: ${ritual.filePath}`);
    }

    if (!ctx.files.includes(ritual.filePath)) {
      ctx.files.push(ritual.filePath);
    }
  }

  const nextAncestry = ritual.filePath ? [...ancestry, ritual.filePath] : ancestry;

  if (ritual.dialect === "steps") {
    const result = await runStepsRitual(ritual, ctx);
    return { ritual, context: ctx, ...result };
  }

  if (ritual.dialect === "timeline") {
    const result = await runTimelineRitual(ritual, ctx, options);
    return { ritual, context: ctx, ...result };
  }

  if (ritual.dialect === "sequence") {
    const result = await runSequenceRitual(ritual, ctx, {
      ...options,
      ancestry: nextAncestry
    });
    return { ritual, context: ctx, ...result };
  }

  ctx.logs.push({
    type: "warning",
    text: `Dialecto no soportado: ${ritual.dialect}`,
    at: ctx.cursor
  });

  return { ritual, context: ctx, start: ctx.cursor, end: ctx.cursor, duration: 0 };
}

export async function runArcSource(source, options = {}) {
  const ritual = parseArc(source, { filePath: options.filePath ?? null });
  return executeRitual(ritual, options);
}

export async function runArcFile(filePath, options = {}) {
  const absolutePath = path.resolve(filePath);
  const source = fs.readFileSync(absolutePath, "utf8");
  return runArcSource(source, {
    ...options,
    filePath: absolutePath,
    projectRoot:
      options.projectRoot || findProjectRoot(path.dirname(absolutePath))
  });
}

function parseCliArgs(argv) {
  const args = {
    file: null,
    outDir: null,
    voiceDir: null,
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!args.file && !token.startsWith("--")) {
      args.file = token;
      continue;
    }

    if (token === "--out") {
      args.outDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token === "--voices") {
      args.voiceDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (token === "--json") {
      args.json = true;
    }
  }

  return args;
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const cli = parseCliArgs(process.argv.slice(2));

  if (!cli.file) {
    console.error("Uso: node engine/runner/index.js <archivo.arc> [--out dir] [--voices dir] [--json]");
    process.exit(1);
  }

  const result = await runArcFile(cli.file);
  const summary = {
    ritual: result.ritual.name,
    dialect: result.ritual.dialect,
    duration: result.duration,
    clips: result.context.timeline.length,
    logs: result.context.logs.length,
    mediaPresent: result.context.media.present.length,
    mediaMissing: result.context.media.missing.length,
    mediaHydrated: result.context.media.hydrated.length,
    mediaPlaceholder: result.context.media.placeholder.length,
    mediaDeclaredMissing: result.context.media.declaredMissing.length,
    mediaUncatalogued: result.context.media.uncatalogued.length,
    mediaReplacementHints: result.context.media.replacementHints.length
  };

  // 🔥 Observer registra resultados reales
  observe({
    type: "runner_execution",
    payload: {
      run_id: process.env.ORCHESTRATOR_RUN_ID ?? null,
      correlation_id: process.env.ORCHESTRATOR_CORRELATION_ID ?? null,
      caused_by: process.env.ORCHESTRATOR_CAUSED_BY ?? null,
      mediaPresent: result.context.media.present.length,
      mediaMissing: result.context.media.missing.length,
      mediaPlaceholder: result.context.media.placeholder.length,
      mediaReplacementHints: result.context.media.replacementHints.length
    }
  });

  if (cli.voiceDir) {
    const voicePack = processVoices(result.context.timeline, cli.voiceDir);
    result.context.timeline.push(...voicePack.assets, ...voicePack.subtitles);
  }

  if (cli.outDir) {
    const exportPath = exportToCapCut(
      { ...result.ritual, timeline: result.context.timeline },
      cli.outDir
    );
    summary.exportPath = exportPath;
  }

  if (cli.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(summary);
}
