# Integrations Layer

Esta carpeta contiene puentes de entrada para conocimiento externo.

## Notion export (Kraken Liminal Lab)

Ruta esperada para export markdown:

`integrations/notion_export/kraken_liminal_lab/`

Flujo recomendado:

1. Exporta en Notion como `Markdown & CSV`.
2. Descomprime en la ruta anterior.
3. Ejecuta `npm run knowledge:fuse`.

## Cíclope (Hugging Face)

Sincroniza corpus markdown desde:

`EloiseCry/ciclope-mitologias-verbales`

Comando:

`npm run knowledge:sync:ciclope`

Si el dataset esta restringido, exporta token antes de correr:

`$env:HF_TOKEN="hf_xxx"`

Salida:

- `runtime/knowledge/ciclope/raw/...`
- `runtime/knowledge/ciclope/manifest.json`

## Fusion pack

Construye un paquete unificado de fragmentos listos para generacion:

`npm run knowledge:fuse`

Salida:

- `runtime/knowledge/fusion/fusion_pack.json`
- `runtime/knowledge/fusion/fusion_prompt.md`
