import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { checkRateLimit } from '@/lib/rate-limit';

// Avatar upload, moved off the client.
//
// This used to run entirely in the browser: the extension came from
// file.name, the content type from file.type, and both went straight to
// supabase.storage.upload() with no allowlist. Since the avatars bucket
// is public, that meant a signed-in user could store an HTML document
// served as text/html from the Supabase project origin -- the same origin
// as the REST and Auth API -- just by calling the storage client from
// devtools with a chosen filename and contentType. The 5 MB size check
// had the same problem: it only ever constrained an honest browser.
//
// Nothing here trusts the client. The extension and stored content type
// are derived from the file's own magic bytes, the path is built from the
// session's user id rather than anything submitted, and the size is
// checked against the bytes actually received.
//
// NOTE: this closes the app-side hole, but the bucket itself should also
// carry allowed_mime_types and file_size_limit in Supabase -- those are
// the only limits that still apply if someone calls the storage API
// directly with their own access token instead of going through here.

const MAX_BYTES = 5 * 1024 * 1024;

// Magic-byte signatures for the formats the picker offers. Keyed by the
// extension and content type we will actually store, so a file's real
// format decides both -- never the submitted name or type.
type ImageKind = { ext: string; contentType: string };

function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { ext: 'png', contentType: 'image/png' };
  }

  // GIF: "GIF87a" or "GIF89a"
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return { ext: 'gif', contentType: 'image/gif' };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { ext: 'webp', contentType: 'image/webp' };
  }

  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await checkRateLimit(`avatar:user:${user.id}`, 10, 3600))) {
    return NextResponse.json(
      { error: 'Too many uploads. Try again later.' },
      { status: 429 },
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Checked against what actually arrived, not file.size.
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5 MB.' }, { status: 413 });
  }
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: 'That file is empty.' }, { status: 400 });
  }

  const kind = sniffImageKind(bytes);
  if (!kind) {
    return NextResponse.json(
      { error: 'That file isn’t a JPEG, PNG, GIF, or WebP image.' },
      { status: 415 },
    );
  }

  // Path is derived from the session, so a caller cannot write to another
  // user's folder by naming one.
  const path = `${user.id}/avatar.${kind.ext}`;
  const service = createServiceRoleClient();

  const { error: uploadError } = await service.storage
    .from('avatars')
    .upload(path, bytes, { upsert: true, contentType: kind.contentType });

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed.' }, { status: 502 });
  }

  const {
    data: { publicUrl },
  } = service.storage.from('avatars').getPublicUrl(path);

  const { error: updateError } = await service
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (updateError) {
    return NextResponse.json({ error: 'Could not save your profile picture.' }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl: publicUrl });
}
