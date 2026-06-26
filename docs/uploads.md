# Source Uploads

Studio treats uploaded files as raw sources. The source file is stored once in local object storage, while the wiki keeps compact text content for indexing, ontology extraction, and build context.

## Current Alpha

- Supported files: text, Markdown, CSV, JSON, YAML, PDF, DOCX, PPTX, RTF.
- Default storage root: `.pwh-studio/objects`.
- Default max upload size: 10 MB per file.
- Small text files are stored as `contentMode: "inline"`.
- Larger or extracted files are stored as `contentMode: "excerpt"` with the full bytes referenced by `object://...`.
- Files whose text cannot be extracted are still stored as raw evidence with `contentMode: "metadata-only"` and a lint issue prompting follow-up extraction.
- PostgreSQL stores source metadata, content hash, content mode, bounded content, and `object_key`.

## Environment

- `PWH_OBJECT_STORE_PATH` changes the local object storage root.
- `PWH_MAX_UPLOAD_BYTES` changes the per-file upload cap.
- `PWH_INLINE_SOURCE_MAX_BYTES` changes the threshold for inline source content.
- `PWH_SOURCE_EXCERPT_CHARS` changes the bounded excerpt length.

## Flow

1. User uploads a file into one selected knowledge base.
2. Studio validates file type and size.
3. Studio writes the original bytes to object storage using a SHA-256 content hash.
4. Studio extracts bounded source text when possible and sends it into the same wiki ingest path used by pasted text.
5. The wiki curator creates a mutation plan, and the user confirms before durable wiki changes are accepted.
6. Pending review state is persisted in PostgreSQL when `PWH_STUDIO_STORE=postgres` and migration `003` is applied.

The design keeps knowledge bases isolated and keeps large local files out of request state, JSON state, and PostgreSQL text columns.
