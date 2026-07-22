import { PDFDocument } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { can, getSessionUser } from "@/lib/permissions";

// طباعة أكتر من بوليصة مع بعض: بنجيب بوليصة كل أوردر من دالة بوسطة وندمجهم في PDF واحد.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const sessionUser = await getSessionUser();
  if (!can(sessionUser, "ship.print")) {
    return new Response("مالكش صلاحية طباعة البوالص", { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100); // حد أقصى معقول

  if (ids.length === 0) {
    return new Response("محددتش أي أوردر", { status: 400 });
  }

  const key = process.env.SYNC_KEY;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !base) {
    return new Response("إعدادات ناقصة", { status: 500 });
  }

  const merged = await PDFDocument.create();
  const failed: string[] = [];

  for (const id of ids) {
    try {
      const res = await fetch(
        `${base}/functions/v1/bosta-awb?key=${key}&order=${id}`,
        { signal: AbortSignal.timeout(20000) }
      );
      if (!res.ok) {
        failed.push(id);
        continue;
      }
      const bytes = await res.arrayBuffer();
      const src = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch {
      failed.push(id);
    }
  }

  if (merged.getPageCount() === 0) {
    return new Response(
      "معرفناش نجيب أي بوليصة — اتأكد إن الأوردرات المحددة اتبعتت لبوسطة",
      { status: 400 }
    );
  }

  const out = await merged.save();
  return new Response(Buffer.from(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=awb-bulk.pdf",
      // عدد اللي فشل (لو حصل) في هيدر مخصص للتشخيص
      "X-Failed-Count": String(failed.length),
    },
  });
}
