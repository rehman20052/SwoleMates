// A HEIC file already in Storage is converted through Supabase's image render.
// This only runs for a HEIC that is still on the device. iPhone picks are asked for a JPEG first.
export async function jpegBytesFromHeic(_bytes: Uint8Array): Promise<Uint8Array> {
  throw new Error("That photo has to be a JPEG, PNG, or WebP.");
}
