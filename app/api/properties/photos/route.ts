import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/apiAuth'

const BUCKET = 'property-damage-photos'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

async function ensureOwnedProperty(propertyId: string, ownerId: string, supabase: ReturnType<typeof getServiceClient>) {
  const { data } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .eq('owner_id', ownerId)
    .maybeSingle()

  return data
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (!auth.ok) return auth.response

  const propertyId = req.nextUrl.searchParams.get('property_id')
  if (!propertyId) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  const svc = getServiceClient()
  const property = await ensureOwnedProperty(propertyId, auth.user.id, svc)
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  const { data, error } = await svc
    .from('property_damage_photos')
    .select('id, storage_path, original_name, mime_type, created_at')
    .eq('property_id', propertyId)
    .eq('owner_id', auth.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const photos = await Promise.all((data || []).map(async (photo) => {
    const { data: signed } = await svc.storage.from(BUCKET).createSignedUrl(photo.storage_path, 60 * 60 * 24 * 7)
    return {
      id: photo.id,
      path: photo.storage_path,
      url: signed?.signedUrl ?? null,
      originalName: photo.original_name,
      mimeType: photo.mime_type,
      createdAt: photo.created_at,
    }
  }))

  return NextResponse.json({ photos }, {
    headers: { 'Cache-Control': 'no-store, private' },
  })
}

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
  const propertyId = formData.get('property_id') as string | null

  if (!file || !propertyId) {
    return NextResponse.json({ error: 'file and property_id are required' }, { status: 400 })
  }

  const svc = getServiceClient()
  const property = await ensureOwnedProperty(propertyId, auth.user.id, svc)
  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 })
  }

  await svc.storage.createBucket(BUCKET, {
    public: false,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    fileSizeLimit: 10 * 1024 * 1024,
  }).catch(() => { /* already exists */ })

  const photoId = crypto.randomUUID()
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${auth.user.id}/${propertyId}/${photoId}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await svc.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { error: insertError } = await svc
    .from('property_damage_photos')
    .insert({
      id: photoId,
      owner_id: auth.user.id,
      property_id: propertyId,
      storage_path: path,
      original_name: file.name,
      mime_type: file.type || null,
    })

  if (insertError) {
    await svc.storage.from(BUCKET).remove([path]).catch(() => { /* best effort cleanup */ })
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const { data: signedData, error: signedError } = await svc.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7)

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Uploaded photo but failed to create signed URL' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    photo: {
      id: photoId,
      path,
      url: signedData.signedUrl,
      originalName: file.name,
      mimeType: file.type || null,
    },
  })
}
