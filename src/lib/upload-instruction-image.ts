import { createClient } from "@/lib/supabase/client";

/**
 * Uploads an image embedded inline in instruction markdown to the public
 * `instruction-images` bucket and returns its permanent public URL — the URL
 * is stored inside body_md, so it must stay valid in the app and in PDFs.
 */
export async function uploadInstructionImage(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "png";
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("instruction-images").upload(path, file);
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("instruction-images").getPublicUrl(path);
  return data.publicUrl;
}
