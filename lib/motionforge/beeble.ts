const BEEBLE_API_BASE = 'https://api.beeble.ai';

function beebleHeaders(): Record<string, string> {
  const key = process.env.BEEBLE_API_KEY;
  if (!key) throw new Error('BEEBLE_API_KEY is not set');
  return {
    'x-api-key':    key,
    'Content-Type': 'application/json',
  };
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface BeebleUploadSlot {
  uploadUrl:  string;
  beebleUri:  string;
}

/**
 * Requests a Beeble upload slot.
 * Returns the pre-signed PUT URL and beeble_uri.
 * The caller must PUT the file bytes directly to uploadUrl.
 */
export async function createBeebleUploadSlot(filename: string): Promise<BeebleUploadSlot> {
  const res = await fetch(`${BEEBLE_API_BASE}/v1/uploads`, {
    method:  'POST',
    headers: beebleHeaders(),
    body:    JSON.stringify({ filename }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Beeble /v1/uploads init failed ${res.status}: ${body}`);
  }
  const data = await res.json() as { upload_url: string; beeble_uri: string };
  return { uploadUrl: data.upload_url, beebleUri: data.beeble_uri };
}

/**
 * Uploads a file buffer to Beeble ephemeral storage.
 * 1. POST /v1/uploads → get upload_url + beeble_uri
 * 2. PUT file buffer to upload_url
 * Returns the beeble_uri for use in SwitchX generation.
 */
export async function uploadToBeeble(
  fileBuffer: Buffer,
  filename: string,
): Promise<string> {
  // Step 1 — request an upload slot
  const initRes = await fetch(`${BEEBLE_API_BASE}/v1/uploads`, {
    method:  'POST',
    headers: beebleHeaders(),
    body:    JSON.stringify({ filename }),
  });
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`Beeble /v1/uploads init failed ${initRes.status}: ${body}`);
  }
  const { upload_url, beeble_uri } = await initRes.json() as {
    upload_url: string;
    beeble_uri: string;
  };

  // Step 2 — PUT the raw bytes to the pre-signed URL
  const ext      = filename.split('.').pop()?.toLowerCase() ?? 'mp4';
  const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                 : ext === 'png'                   ? 'image/png'
                 :                                   'video/mp4';

  const putRes = await fetch(upload_url, {
    method:  'PUT',
    headers: { 'Content-Type': mimeType },
    body:    fileBuffer,
  });
  if (!putRes.ok && putRes.status !== 204) {
    const body = await putRes.text();
    throw new Error(`Beeble upload PUT failed ${putRes.status}: ${body}`);
  }

  console.log(`[beeble] Uploaded → ${beeble_uri}`);
  return beeble_uri;
}

// ─── Generation ───────────────────────────────────────────────────────────────

export interface SwitchXParams {
  sourceUri:           string;
  referenceImageUri?:  string;
  prompt:              string;
  alphaMode:           'auto' | 'fill';
  maxResolution:       720 | 1080;
}

/**
 * Starts a Beeble SwitchX generation task.
 * Returns the Beeble job id.
 */
export async function createSwitchXTask(params: SwitchXParams): Promise<string> {
  const body: Record<string, unknown> = {
    generation_type:      'video',
    source_uri:           params.sourceUri,
    alpha_mode:           params.alphaMode,
    max_resolution:       params.maxResolution,
    prompt:               params.prompt,
  };
  if (params.referenceImageUri) {
    body.reference_image_uri = params.referenceImageUri;
  }

  console.log(`[beeble] createSwitchXTask — prompt="${params.prompt.slice(0, 80)}…" refImage=${!!params.referenceImageUri} alpha=${params.alphaMode} res=${params.maxResolution}`);

  const res = await fetch(`${BEEBLE_API_BASE}/v1/switchx/generations`, {
    method:  'POST',
    headers: beebleHeaders(),
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    console.error(`[beeble] ❌ SwitchX create FAILED ${res.status}:`, errBody);
    throw new Error(`Beeble SwitchX error ${res.status}: ${errBody}`);
  }

  const data = await res.json() as { id: string };
  console.log(`[beeble] Task created → ${data.id}`);
  return data.id;
}

// ─── Polling ─────────────────────────────────────────────────────────────────

export interface BeebleJobResult {
  status:     string;
  outputUrl?: string;
  progress?:  number;   // 0-100 if Beeble returns it, otherwise undefined
}

/**
 * Polls a Beeble SwitchX job for its current status.
 * Maps Beeble statuses to our internal status string.
 * Returns outputUrl when status is 'completed'.
 */
export async function pollSwitchXJob(jobId: string): Promise<BeebleJobResult> {
  const res = await fetch(`${BEEBLE_API_BASE}/v1/switchx/generations/${jobId}`, {
    headers: {
      'x-api-key': process.env.BEEBLE_API_KEY ?? '',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Beeble poll error ${res.status}: ${body}`);
  }

  const data = await res.json() as {
    status: string;
    output?: { render?: string };
    progress?: number;
    error?:  string;
  };

  console.log(`[beeble] pollSwitchXJob raw response:`, JSON.stringify({
    status:    data.status,
    progress:  data.progress,
    outputRender: data.output?.render?.slice(0, 80) ?? null,
    error:     data.error ?? null,
  }));

  const raw = (data.status ?? '').toLowerCase();

  // Normalise to our internal status vocabulary
  const status =
    raw === 'completed'              ? 'completed'
    : raw === 'failed' || raw === 'error' ? 'failed'
    : 'generating';

  return {
    status,
    outputUrl: data.output?.render ?? undefined,
    progress:  typeof data.progress === 'number' ? data.progress : undefined,
  };
}
