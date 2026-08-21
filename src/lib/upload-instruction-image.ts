import { createClient } from "@/lib/supabase/client";
import { getOrgId } from "@/lib/supabase/client-org";

/**
 * Uploads an image embedded inline in instruction markdown to the public
 * `instruction-images` bucket and returns its permanent public URL — the URL
 * is stored inside body_md, so it must stay valid in the app and in PDFs.
 * Paths lead with the org id: storage RLS (0025) scopes writes to folder 1.
 */
// Extension derives from the MIME type, not the user-typed filename.
const IMAGE_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export async function uploadInstructionImage(file: File, folder: string): Promise<string> {
  const ext = IMAGE_EXT[file.type];
  if (!ext) throw new Error("Only images can be embedded in an instruction.");
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} is over the 25 MB limit.`);
  const supabase = createClient();
  const orgId = await getOrgId();
  if (!orgId) throw new Error("Could not resolve your organization — sign in again.");
  const path = `${orgId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("instruction-images").upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("instruction-images").getPublicUrl(path);
  return data.publicUrl;
}
