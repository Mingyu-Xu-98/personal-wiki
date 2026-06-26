import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import { persistUploadedSourceFile } from "../../../lib/server/object-storage";
import {
  addSource,
  amendKnowledgeMutationReview,
  approveKnowledgeMutationReview,
  createKnowledgeBase,
  getKnowledge,
  prepareStudioState,
  rejectKnowledgeMutationReview
} from "../../../lib/server/store";

const isUploadedFile = (value: FormDataEntryValue | null): value is File =>
  typeof File !== "undefined" && value instanceof File;

export async function GET(request: Request) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const baseId = new URL(request.url).searchParams.get("baseId");
  return NextResponse.json(getKnowledge(user.id, baseId));
}

export async function POST(request: Request) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!isUploadedFile(file)) {
        return NextResponse.json({ error: "请选择要上传的文件。" }, { status: 400 });
      }
      const baseIdValue = form.get("baseId");
      const baseId = typeof baseIdValue === "string" && baseIdValue.trim() ? baseIdValue.trim() : undefined;
      const bytes = Buffer.from(await file.arrayBuffer());
      const prepared = persistUploadedSourceFile({
        userId: user.id,
        baseId: baseId ?? "default",
        fileName: file.name,
        mediaType: file.type,
        bytes
      });
      const result = await addSource({
        userId: user.id,
        ...(baseId ? { baseId } : {}),
        title: prepared.title,
        content: prepared.content,
        uri: prepared.uri,
        mediaType: prepared.mediaType,
        contentHash: prepared.contentHash,
        contentMode: prepared.contentMode,
        byteSize: prepared.byteSize,
        metadata: prepared.metadata
      });
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "上传失败，请稍后再试。" },
        { status: 400 }
      );
    }
  }

  const body = await request.json();
  if (body.kind === "base") {
    const input: { name: string; description?: string } = {
      name: String(body.name || "未命名知识库")
    };
    if (body.description) input.description = String(body.description);
    const base = createKnowledgeBase(user.id, input);
    return NextResponse.json({ base });
  }
  if (body.kind === "mutation-review") {
    const baseId = typeof body.baseId === "string" ? body.baseId : undefined;
    const reviewId = String(body.reviewId || body.planId || "");
    const action = String(body.action || "");
    if (!reviewId) {
      return NextResponse.json({ error: "Missing review id." }, { status: 400 });
    }
    if (action === "approve") {
      return NextResponse.json(approveKnowledgeMutationReview({ userId: user.id, ...(baseId ? { baseId } : {}), reviewId }));
    }
    if (action === "reject") {
      return NextResponse.json(rejectKnowledgeMutationReview({ userId: user.id, ...(baseId ? { baseId } : {}), reviewId }));
    }
    if (action === "amend") {
      const title = typeof body.title === "string" ? body.title : undefined;
      const content = typeof body.content === "string" ? body.content : undefined;
      return NextResponse.json(
        await amendKnowledgeMutationReview({
          userId: user.id,
          ...(baseId ? { baseId } : {}),
          reviewId,
          ...(title !== undefined ? { title } : {}),
          ...(content !== undefined ? { content } : {})
        })
      );
    }
    return NextResponse.json({ error: "Unsupported review action." }, { status: 400 });
  }

  const sourceInput: { baseId?: string; title: string; content: string } = {
    title: String(body.title || "Untitled Source"),
    content: String(body.content || "")
  };
  if (body.baseId) sourceInput.baseId = String(body.baseId);
  const result = await addSource({
    userId: user.id,
    ...sourceInput,
    ...(body.uri ? { uri: String(body.uri) } : {})
  });
  return NextResponse.json(result);
}
