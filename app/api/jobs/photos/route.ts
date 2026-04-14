import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/apiAuth'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'job-photos'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

// POST /api/jobs/photos — upload a photo to Supabase Storage
// Body: multipart/form-data — fields: file (File), job_id, photo_id
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const jobId = formData.get('job_id') as string | null
  const photoId = formData.get('photo_id') as string | null

  if (!file || !jobId || !photoId) {
    return NextResponse.json({ error: 'file, job_id, and photo_id are required' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.user.id}/${jobId}/${photoId}.${ext}`

  const svc = getServiceClient()

  // Ensure the bucket exists (idempotent)
  await svc.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
  }).catch(() => { /* already exists */ })

  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (error) {
    console.error('[jobs/photos] upload error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: urlData } = svc.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl, path })
}

// DELETE /api/jobs/photos — remove a photo from storage
// Body: { path: string }
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const { path } = await req.json() as { path?: string }
  if (!path) return NextResponse.json({ error: 'path required' }, { status: 400 })

  // Security: path must belong to the authenticated user
  if (!path.startsWith(`${auth.user.id}/`)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const svc = getServiceClient()
  const { error } = await svc.storage.from(BUCKET).remove([path])
  if (error) {
    console.error('[jobs/photos] delete error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
