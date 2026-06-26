import { NextResponse } from "next/server";
import { requireUser } from "../../../../../../lib/server/auth";
import { getPublishedSiteFile, prepareStudioState } from "../../../../../../lib/server/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicationId: string; path?: string[] }> }
) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const params = await context.params;
  const filePath = params.path?.join("/") || "index.html";

  try {
    const file = getPublishedSiteFile(user.id, params.publicationId, filePath);
    return new NextResponse(file.content, {
      headers: {
        "content-type": file.mediaType,
        "cache-control": "private, max-age=0, must-revalidate",
        "x-pwh-artifact-path": file.absolutePath
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Published site file not found." },
      { status: 404 }
    );
  }
}
