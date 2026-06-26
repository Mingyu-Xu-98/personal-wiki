import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SourceDocument } from "@personal-wiki-harness/wiki-core";

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const DEFAULT_INLINE_MAX_BYTES = 120_000;
const DEFAULT_EXCERPT_CHARS = 12_000;

type PersistUploadedSourceFileInput = {
  userId: string;
  baseId: string;
  fileName: string;
  mediaType?: string;
  bytes: Buffer;
};

type PersistedUploadedSourceFile = {
  title: string;
  uri: string;
  mediaType: string;
  contentHash: string;
  contentMode: NonNullable<SourceDocument["contentMode"]>;
  content: string;
  byteSize: number;
  metadata: Record<string, unknown>;
};

const textExtensions = new Map<string, string>([
  [".txt", "text/plain"],
  [".md", "text/markdown"],
  [".markdown", "text/markdown"],
  [".csv", "text/csv"],
  [".json", "application/json"],
  [".yaml", "application/yaml"],
  [".yml", "application/yaml"],
  [".rtf", "application/rtf"]
]);

const binaryDocumentExtensions = new Map<string, string>([
  [".pdf", "application/pdf"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]
]);

const cleanPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const safePathPart = (value: string) =>
  value
    .trim()
    .replace(/[^\w.\-\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "upload";

const stripExtension = (fileName: string) => {
  const ext = path.extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
};

export const getObjectStorageConfig = () => ({
  rootPath: process.env.PWH_OBJECT_STORE_PATH || path.join(".pwh-studio", "objects"),
  maxUploadBytes: cleanPositiveInt(process.env.PWH_MAX_UPLOAD_BYTES, DEFAULT_MAX_UPLOAD_BYTES),
  inlineMaxBytes: cleanPositiveInt(process.env.PWH_INLINE_SOURCE_MAX_BYTES, DEFAULT_INLINE_MAX_BYTES),
  excerptChars: cleanPositiveInt(process.env.PWH_SOURCE_EXCERPT_CHARS, DEFAULT_EXCERPT_CHARS)
});

export const detectTextMediaType = (fileName: string, providedType?: string) => {
  const cleanType = providedType?.split(";")[0]?.trim().toLowerCase();
  if (cleanType?.startsWith("text/")) return cleanType;
  if (cleanType === "application/json") return cleanType;
  if (cleanType === "application/yaml" || cleanType === "application/x-yaml") return "application/yaml";
  const ext = path.extname(fileName).toLowerCase();
  return textExtensions.get(ext) ?? binaryDocumentExtensions.get(ext) ?? cleanType ?? "application/octet-stream";
};

export const assertAllowedUpload = (input: { fileName: string; mediaType: string; size: number }) => {
  const config = getObjectStorageConfig();
  if (!input.fileName.trim()) {
    throw new Error("文件名不能为空。");
  }
  if (input.size <= 0) {
    throw new Error("文件内容为空。");
  }
  if (input.size > config.maxUploadBytes) {
    throw new Error(`文件太大。当前 alpha 单文件上限为 ${(config.maxUploadBytes / 1024 / 1024).toFixed(1)} MB。`);
  }

  const ext = path.extname(input.fileName).toLowerCase();
  const supported =
    input.mediaType.startsWith("text/") ||
    input.mediaType === "application/json" ||
    input.mediaType === "application/yaml" ||
    textExtensions.has(ext) ||
    binaryDocumentExtensions.has(ext);
  if (!supported) {
    throw new Error("当前支持文本、Markdown、CSV、JSON、YAML、PDF、DOCX、PPTX、RTF 文件。");
  }
};

export const persistUploadedSourceFile = (input: PersistUploadedSourceFileInput): PersistedUploadedSourceFile => {
  const mediaType = detectTextMediaType(input.fileName, input.mediaType);
  assertAllowedUpload({
    fileName: input.fileName,
    mediaType,
    size: input.bytes.byteLength
  });

  const config = getObjectStorageConfig();
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const safeFileName = safePathPart(input.fileName);
  const objectKey = path.posix.join(
    "sources",
    safePathPart(input.userId),
    safePathPart(input.baseId),
    `${contentHash.slice(0, 16)}-${safeFileName}`
  );
  const diskPath = path.join(config.rootPath, ...objectKey.split("/"));
  mkdirSync(path.dirname(diskPath), { recursive: true });
  if (!existsSync(diskPath)) {
    writeFileSync(diskPath, input.bytes);
  }

  const extraction = extractTextFromStoredFile({
    diskPath,
    fileName: input.fileName,
    mediaType,
    bytes: input.bytes
  });
  const extractedText = extraction.text.replace(/\u0000/g, "").trim();
  const hasText = extractedText.length > 0;
  const inline = hasText && input.bytes.byteLength <= config.inlineMaxBytes;
  const contentMode: NonNullable<SourceDocument["contentMode"]> = hasText ? (inline ? "inline" : "excerpt") : "metadata-only";
  const content = !hasText
    ? `文件已保存，但暂时没有提取到可用正文。文件名：${input.fileName}。后续可通过对象存储引用重新处理。`
    : inline
      ? extractedText
      : `${extractedText.slice(0, config.excerptChars)}\n\n[内容已截断：原文件保存在对象存储，后续分析可按需读取完整文件。]`;

  return {
    title: stripExtension(input.fileName) || input.fileName,
    uri: `object://${objectKey}`,
    mediaType,
    contentHash,
    contentMode,
    content,
    byteSize: input.bytes.byteLength,
    metadata: {
      objectKey,
      originalFileName: input.fileName,
      storedBytes: input.bytes.byteLength,
      extractedChars: extractedText.length,
      truncated: hasText && !inline,
      extractionStatus: extraction.status,
      extractionMethod: extraction.method,
      storage: "local-fs"
    }
  };
};

export const readStoredObjectExcerpt = (input: {
  objectKey: string;
  fileName?: string;
  mediaType?: string;
  maxBytes?: number;
}) => {
  const normalizedKey = path.posix.normalize(input.objectKey).replace(/^\/+/, "");
  if (!normalizedKey || normalizedKey.startsWith("../") || normalizedKey.includes("/../")) {
    throw new Error("Invalid object key.");
  }
  const diskPath = path.join(getObjectStorageConfig().rootPath, ...normalizedKey.split("/"));
  if (!existsSync(diskPath)) {
    throw new Error("Stored object not found.");
  }
  const bytes = readFileSync(diskPath);
  const text = extractTextFromStoredFile({
    diskPath,
    fileName: input.fileName ?? path.basename(normalizedKey),
    mediaType: input.mediaType ?? detectTextMediaType(normalizedKey),
    bytes
  }).text;
  return {
    objectKey: normalizedKey,
    byteSize: bytes.byteLength,
    content: text.slice(0, input.maxBytes ?? 16_384)
  };
};

const extractTextFromStoredFile = (input: {
  diskPath: string;
  fileName: string;
  mediaType: string;
  bytes: Buffer;
}): { text: string; status: "extracted" | "empty" | "failed"; method: string } => {
  const ext = path.extname(input.fileName).toLowerCase();
  if (input.mediaType.startsWith("text/") || input.mediaType === "application/json" || input.mediaType === "application/yaml") {
    return { text: input.bytes.toString("utf8"), status: "extracted", method: "utf8" };
  }
  if (ext === ".rtf") {
    return { text: stripRtf(input.bytes.toString("utf8")), status: "extracted", method: "rtf-strip" };
  }
  if (ext === ".docx") {
    return extractOfficeOpenXml(input.diskPath, "word/document.xml", "docx-unzip");
  }
  if (ext === ".pptx") {
    return extractOfficeOpenXml(input.diskPath, "ppt/slides/*.xml", "pptx-unzip");
  }
  if (ext === ".pdf") {
    return extractPdf(input.diskPath, input.bytes);
  }
  return { text: "", status: "empty", method: "unsupported-binary" };
};

const extractOfficeOpenXml = (diskPath: string, pattern: string, method: string) => {
  const result = spawnSync("unzip", ["-p", diskPath, pattern], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    return { text: "", status: "failed" as const, method };
  }
  const text = result.stdout
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return { text, status: text ? ("extracted" as const) : ("empty" as const), method };
};

const extractPdf = (diskPath: string, bytes: Buffer) => {
  const result = spawnSync("pdftotext", [diskPath, "-"], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.status === 0 && result.stdout.trim()) {
    return { text: result.stdout, status: "extracted" as const, method: "pdftotext" };
  }
  const text = bytes
    .toString("latin1")
    .match(/[A-Za-z0-9\u4e00-\u9fa5][A-Za-z0-9\u4e00-\u9fa5\s,.;:!?'"()[\]#/@&%+\-]{12,}/g)
    ?.join("\n") ?? "";
  return { text, status: text ? ("extracted" as const) : ("empty" as const), method: "pdf-printable-fallback" };
};

const stripRtf = (value: string) =>
  value
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
