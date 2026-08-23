'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { UserIcon } from '@/components/icons';

function CameraIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function AvatarUpload({
  userId,
  avatarUrl,
  size = 80,
  shape = 'circle',
}: {
  userId: string;
  avatarUrl: string | null;
  size?: number;
  shape?: 'circle' | 'square';
}) {
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be under 5 MB.');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path);

      // Cache-bust so the updated image shows immediately
      const busted = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      setPreview(busted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
      // Reset input so selecting the same file again still fires onChange
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 sm:items-start">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`group relative overflow-hidden transition-transform duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.97] disabled:cursor-wait disabled:active:scale-100 ${shape === 'square' ? 'rounded-xl' : 'rounded-full'}`}
        style={{
          width: size,
          height: size,
          border: '2px solid var(--rule)',
        }}
        aria-label="Change profile picture"
      >
        {preview ? (
          <Image src={preview} alt="Profile picture" fill sizes="80px" className="object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: 'var(--surface)', color: 'var(--accent)' }}
          >
            <UserIcon size={size * 0.4} />
          </div>
        )}

        {/* Hover overlay -- Tailwind's hover:/group-hover: variants are
            already wrapped in @media (hover: hover) as of v3.4+ (verified
            against this project's installed v4), so this doesn't ghost-
            flash on a touch tap the way a bare :hover selector would.
            Below `sm:` there's no hover to reveal it at all though, so a
            touch user had zero visible cue this was tappable besides the
            invisible aria-label -- a small always-on badge in the corner
            covers that case without needing the full-overlay treatment
            hover gives on desktop. */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 transition-opacity duration-150 sm:group-hover:opacity-100"
          style={{ background: 'rgba(12,15,14,0.7)', color: '#ffffff' }}
        >
          {uploading ? (
            <div
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          ) : (
            <CameraIcon />
          )}
        </div>
        <div
          className="absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center rounded-full sm:hidden"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          aria-hidden="true"
        >
          {uploading ? (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <CameraIcon size={13} />
          )}
        </div>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={handleFile}
      />

      {error && (
        <p className="text-xs" style={{ color: 'var(--error-ink)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
