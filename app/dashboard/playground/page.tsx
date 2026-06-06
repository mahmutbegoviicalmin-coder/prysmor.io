"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Upload, Play, RotateCcw, ArrowRight, CheckCircle,
  Loader2, AlertCircle, ImageIcon, X, Layers, Sun,
  Zap, Clock, Wand2,
} from "lucide-react";

const GREEN   = "#39FF6A";
const MAX_SEC = 2;

type Mode  = "background" | "relight";
type Stage = "idle" | "uploading" | "generating" | "done" | "error";

interface JobState {
  jobId:     string;
  stage:     Stage;
  progress:  number;
  outputUrl: string | null;
  error:     string | null;
}

const MODES: { id: Mode; label: string; Icon: React.ElementType; hint: string }[] = [
  { id: "background", label: "Background", Icon: Layers, hint: "Replace the background using a reference image or a prompt." },
  { id: "relight",    label: "Relight",    Icon: Sun,    hint: "Change the light and mood of the scene with a single sentence." },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res((r.result as string).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.onloadedmetadata = () => { URL.revokeObjectURL(url); res(vid.duration); };
    vid.onerror          = () => { URL.revokeObjectURL(url); rej(new Error("Cannot read duration")); };
    vid.src = url;
  });
}

export default function PlaygroundPage() {
  const { user } = useUser();

  const [mode,        setMode]        = useState<Mode>("background");
  const [videoFile,   setVideoFile]   = useState<File | null>(null);
  const [videoUrl,    setVideoUrl]    = useState<string | null>(null);
  const [videoDur,    setVideoDur]    = useState<number>(0);
  const [refImage,    setRefImage]    = useState<string | null>(null);
  const [refImageUrl, setRefImageUrl] = useState<string | null>(null);
  const [prompt,      setPrompt]      = useState("");
  const [dragOver,    setDragOver]    = useState(false);
  const [durationErr, setDurationErr] = useState<string | null>(null);
  const [job,         setJob]         = useState<JobState | null>(null);
  const [trialUsed,   setTrialUsed]   = useState(false);
  const [trialLoaded, setTrialLoaded] = useState(false);
  const [enhancing,   setEnhancing]   = useState(false);

  const videoInputRef = useRef<HTMLInputElement>(null);
  const refInputRef   = useRef<HTMLInputElement>(null);
  const pollRef       = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/v1/playground/status")
      .then(r => r.json())
      .then(d => { setTrialUsed(d.trialUsed ?? false); setTrialLoaded(true); })
      .catch(() => setTrialLoaded(true));
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);
  useEffect(() => () => stopPolling(), [stopPolling]);

  /* ── Video handling ─────────────────────────────────────────────────────── */
  const handleVideoFile = useCallback(async (file: File) => {
    setDurationErr(null);
    setVideoFile(null);
    setVideoUrl(null);

    if (!file.type.startsWith("video/") && !file.name.match(/\.mp4$/i)) {
      setDurationErr("Only .mp4 files are accepted.");
      return;
    }
    if (!file.name.match(/\.mp4$/i) && file.type !== "video/mp4") {
      setDurationErr("Only .mp4 files are accepted.");
      return;
    }

    let dur = 0;
    try { dur = await getVideoDuration(file); }
    catch { setDurationErr("Could not read video duration. Try a different file."); return; }

    if (dur > MAX_SEC + 0.15) {
      setDurationErr(`Video is ${dur.toFixed(1)}s, maximum is ${MAX_SEC}s. Please trim before uploading.`);
      return;
    }

    setVideoDur(dur);
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleVideoFile(f);
  }, [handleVideoFile]);

  /* ── Reference image ────────────────────────────────────────────────────── */
  const handleRefImage = useCallback(async (file: File) => {
    const b64 = await fileToBase64(file);
    setRefImage(b64);
    setRefImageUrl(URL.createObjectURL(file));
  }, []);

  const removeRef = useCallback(() => {
    setRefImage(null);
    if (refImageUrl) URL.revokeObjectURL(refImageUrl);
    setRefImageUrl(null);
  }, [refImageUrl]);

  /* ── Enhance prompt ────────────────────────────────────────────────────── */
  const handleEnhance = useCallback(async () => {
    if (!prompt.trim() || enhancing || !!job) return;
    setEnhancing(true);
    try {
      const res  = await fetch("/api/v1/playground/enhance", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt: prompt.trim(), mode }),
      });
      const data = await res.json();
      if (res.ok && data.enhancedPrompt) setPrompt(data.enhancedPrompt);
    } catch { /* fail silently */ }
    finally { setEnhancing(false); }
  }, [prompt, mode, enhancing, job]);

  /* ── Generate ───────────────────────────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!videoFile || !user) return;
    setJob({ jobId: "", stage: "uploading", progress: 2, outputUrl: null, error: null });

    try {
      const jobRes  = await fetch("/api/v1/playground/jobs", { method: "POST" });
      const jobData = await jobRes.json();
      if (!jobRes.ok) {
        const msg = jobData.message ?? (jobData.error === "trial_used" ? "Your free trial has already been used." : "Failed to start.");
        setJob(j => ({ ...j!, stage: "error", error: msg }));
        if (jobData.error === "trial_used") setTrialUsed(true);
        return;
      }

      const jobId: string = jobData.jobId;
      setJob(j => ({ ...j!, jobId, progress: 10 }));

      // Proxy upload through our server to avoid Beeble S3 CORS restrictions
      const uploadRes = await fetch(
        `/api/v1/playground/jobs/${jobId}/upload?mode=${mode}`,
        { method: "POST", body: videoFile, headers: { "Content-Type": "video/mp4" } },
      );
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed");

      setJob(j => ({ ...j!, stage: "generating", progress: 30 }));

      const genRes  = await fetch(`/api/v1/playground/jobs/${jobId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt:         prompt.trim() || (mode === "relight" ? "Natural warm lighting" : "Clean studio background"),
          referenceImage: mode === "background" ? (refImage ?? undefined) : undefined,
          clipDuration:   videoDur,
          beebleVideoUri: uploadData.beebleUri,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) {
        const msg = genData.error === "trial_used" ? "Free trial already used." : (genData.error ?? "Generation failed.");
        setJob(j => ({ ...j!, stage: "error", error: msg }));
        return;
      }

      setJob(j => ({ ...j!, progress: 35 }));

      pollRef.current = setInterval(async () => {
        try {
          const poll = await fetch(`/api/v1/playground/jobs/${jobId}`);
          const data  = await poll.json();
          if (data.status === "completed") {
            stopPolling();
            setJob(j => ({ ...j!, stage: "done", progress: 100, outputUrl: data.outputUrl }));
            setTrialUsed(true);
          } else if (data.status === "failed") {
            stopPolling();
            setJob(j => ({ ...j!, stage: "error", error: data.error ?? "Generation failed." }));
          } else {
            setJob(j => ({ ...j!, progress: Math.max(j!.progress, data.progress ?? j!.progress) }));
          }
        } catch { /* ignore transient */ }
      }, 4000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setJob(j => j ? { ...j, stage: "error", error: msg } : null);
    }
  }, [videoFile, user, mode, prompt, refImage, videoDur, stopPolling]);

  const resetAll = useCallback(() => {
    stopPolling(); setJob(null);
    setVideoFile(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null); setVideoDur(0);
    removeRef(); setPrompt(""); setDurationErr(null);
  }, [stopPolling, videoUrl, removeRef]);

  const isWorking   = job?.stage === "uploading" || job?.stage === "generating";
  const canGenerate = !!videoFile && !durationErr && !!prompt.trim() && !job;

  if (!trialLoaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <Loader2 style={{ width: 22, height: 22, color: GREEN, animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080808",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: "52px",
        borderBottom: "1px solid #111",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: "10px",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "13px", fontWeight: 600, color: "white", letterSpacing: "-0.2px" }}>
          Playground
        </span>
        <span style={{
          fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
          color: GREEN, background: "rgba(57,255,106,0.08)", border: "1px solid rgba(57,255,106,0.18)",
          padding: "3px 8px", borderRadius: "20px", flexShrink: 0,
        }}>
          Free Trial
        </span>

        <div style={{ flex: 1 }} />

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div className="hidden sm:flex" style={{ alignItems: "center", gap: "5px" }}>
            <Clock style={{ width: 11, height: 11, color: "#333" }} />
            <span style={{ fontSize: "11px", color: "#333" }}>Max 2s · MP4 only</span>
          </div>
          {trialUsed && (
            <a
              href="/dashboard/billing"
              style={{
                display: "flex", alignItems: "center", gap: "5px",
                fontSize: "12px", fontWeight: 600, color: "#000",
                background: GREEN, padding: "5px 12px", borderRadius: "6px",
                textDecoration: "none", flexShrink: 0,
              }}
            >
              Upgrade <ArrowRight style={{ width: 11, height: 11 }} />
            </a>
          )}
        </div>
      </div>

      {/* ── Main layout ─────────────────────────────────────────────────────── */}
      <div className="pg-main">

        {/* Left, preview canvas */}
        <div className="pg-preview">
          {/* 16:9 canvas */}
          <div style={{
            width: "100%",
            maxWidth: "720px",
            aspectRatio: "16 / 9",
            background: "#0a0a0a",
            border: "1px solid #141414",
            borderRadius: "10px",
            overflow: "hidden",
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            {/* Output video */}
            {job?.stage === "done" && job.outputUrl ? (
              <>
                <video
                  src={job.outputUrl}
                  autoPlay loop controls playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                {/* Watermark */}
                <div style={{
                  position: "absolute", top: "12px", right: "12px",
                  display: "flex", alignItems: "center", gap: "5px",
                  background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "6px", padding: "4px 9px",
                  pointerEvents: "none", userSelect: "none",
                }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 700, letterSpacing: "0.04em",
                    color: "rgba(255,255,255,0.55)",
                    fontFamily: "inherit",
                  }}>
                    prysmor.io
                  </span>
                </div>
              </>
            ) : videoUrl && !job ? (
              <video
                src={videoUrl}
                controls
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              />
            ) : (
              /* Empty state */
              <div style={{ textAlign: "center", userSelect: "none" }}>
                {isWorking ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "50%",
                      border: `2px solid #1a1a1a`, borderTopColor: GREEN,
                      animation: "spin 0.8s linear infinite",
                    }} />
                    <span style={{ fontSize: "12px", color: "#333" }}>
                      {job?.stage === "uploading" ? "Uploading…" : "Generating…"}
                    </span>
                    {/* Progress bar */}
                    <div style={{ width: "180px", height: "2px", background: "#111", borderRadius: "1px", overflow: "hidden" }}>
                      <div style={{ height: "100%", background: GREEN, width: `${job?.progress ?? 0}%`, transition: "width 0.6s ease" }} />
                    </div>
                    <span style={{ fontSize: "11px", color: "#2a2a2a" }}>{job?.progress ?? 0}%</span>
                  </div>
                ) : job?.stage === "error" ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "0 24px" }}>
                    <AlertCircle style={{ width: 24, height: 24, color: "#F87171" }} />
                    <span style={{ fontSize: "12px", color: "#F87171", lineHeight: 1.5, textAlign: "center" }}>
                      {job.error}
                    </span>
                    <button onClick={resetAll} style={{
                      marginTop: "4px", display: "flex", alignItems: "center", gap: "5px",
                      background: "#111", border: "1px solid #1e1e1e", color: "#555",
                      padding: "7px 14px", borderRadius: "6px", cursor: "pointer", fontSize: "12px",
                    }}>
                      <RotateCcw style={{ width: 12, height: 12 }} /> Try again
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{
                      width: "40px", height: "40px", borderRadius: "10px",
                      background: "#0f0f0f", border: "1px solid #161616",
                      display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px",
                    }}>
                      <Layers style={{ width: 18, height: 18, color: "#2a2a2a" }} />
                    </div>
                    <p style={{ fontSize: "13px", color: "#2a2a2a", margin: 0, fontWeight: 500 }}>
                      Upload a clip to preview
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Output action overlay */}
          {job?.stage === "done" && job.outputUrl && (
            <div style={{
              position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)",
              display: "flex", gap: "8px",
            }}>
              <a href="/dashboard/billing" style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "transparent", border: `1px solid rgba(57,255,106,0.25)`,
                color: GREEN, fontSize: "12px", fontWeight: 600,
                padding: "8px 14px", borderRadius: "7px", textDecoration: "none",
              }}>
                Upgrade <ArrowRight style={{ width: 12, height: 12 }} />
              </a>
            </div>
          )}
        </div>

        {/* Right, control panel */}
        <div className="pg-panel">

          {/* Mode selector */}
          <div style={{ padding: "20px 20px 0" }}>
            <p style={{ fontSize: "10px", fontWeight: 600, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
              Mode
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {MODES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { if (!job) setMode(id); }}
                  disabled={!!job}
                  style={{
                    display: "flex", alignItems: "center", gap: "9px",
                    padding: "9px 12px", borderRadius: "7px", border: "none", cursor: job ? "default" : "pointer",
                    background: mode === id ? "#111" : "transparent",
                    outline: mode === id ? `1px solid #1e1e1e` : "none",
                    transition: "all 0.12s",
                  }}
                >
                  <Icon style={{
                    width: 14, height: 14, flexShrink: 0,
                    color: mode === id ? GREEN : "#2e2e2e",
                  }} />
                  <span style={{
                    fontSize: "13px", fontWeight: mode === id ? 600 : 400,
                    color: mode === id ? "white" : "#3a3a3a",
                  }}>
                    {label}
                  </span>
                  {mode === id && (
                    <div style={{
                      marginLeft: "auto", width: "5px", height: "5px",
                      borderRadius: "50%", background: GREEN, flexShrink: 0,
                    }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div style={{ height: "1px", background: "#111", margin: "18px 0" }} />

          {/* Video upload */}
          <div style={{ padding: "0 20px" }}>
            <p style={{ fontSize: "10px", fontWeight: 600, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 10px" }}>
              Video clip
            </p>

            {!videoFile ? (
              <div
                onDragOver={e => { e.preventDefault(); if (!job) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { if (!job) handleDrop(e); }}
                onClick={() => { if (!job) videoInputRef.current?.click(); }}
                style={{
                  border: `1px dashed ${dragOver ? GREEN : "#1c1c1c"}`,
                  borderRadius: "8px",
                  padding: "24px 16px",
                  textAlign: "center",
                  cursor: job ? "default" : "pointer",
                  background: dragOver ? "rgba(57,255,106,0.02)" : "transparent",
                  transition: "all 0.15s",
                }}
              >
                <Upload style={{ width: 18, height: 18, color: "#252525", margin: "0 auto 10px" }} />
                <p style={{ fontSize: "12px", color: "#333", margin: "0 0 3px", fontWeight: 500 }}>
                  Drop .mp4 here or click to browse
                </p>
                <p style={{ fontSize: "11px", color: "#222", margin: 0 }}>
                  Maximum 2 seconds
                </p>
              </div>
            ) : (
              <div style={{
                border: "1px solid #1a1a1a", borderRadius: "8px",
                overflow: "hidden", position: "relative",
              }}>
                {/* 16:9 thumb */}
                <div style={{ aspectRatio: "16/9", background: "#0a0a0a", overflow: "hidden", position: "relative" }}>
                  {videoUrl && (
                    <video src={videoUrl} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  )}
                  {/* Play hint overlay */}
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.25)",
                    pointerEvents: "none",
                  }}>
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "50%",
                      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}>
                      <Play style={{ width: 10, height: 10, color: "rgba(255,255,255,0.7)", marginLeft: "2px" }} />
                    </div>
                  </div>
                </div>
                {/* Meta row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderTop: "1px solid #111",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                    <div style={{
                      width: "5px", height: "5px", borderRadius: "50%",
                      background: GREEN, flexShrink: 0,
                    }} />
                    <span style={{ fontSize: "11px", color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {videoFile.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <span style={{ fontSize: "11px", color: "#333" }}>{videoDur.toFixed(1)}s</span>
                    {!job && (
                      <button
                        onClick={() => { setVideoFile(null); if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoUrl(null); setDurationErr(null); }}
                        style={{ background: "none", border: "none", color: "#2e2e2e", cursor: "pointer", padding: "1px", display: "flex" }}
                      >
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <input
              ref={videoInputRef}
              type="file" accept=".mp4,video/mp4"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoFile(f); }}
            />

            {durationErr && (
              <div style={{
                display: "flex", alignItems: "flex-start", gap: "7px",
                marginTop: "8px", padding: "9px 10px",
                background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.15)",
                borderRadius: "6px",
              }}>
                <AlertCircle style={{ width: 12, height: 12, color: "#F87171", flexShrink: 0, marginTop: "1px" }} />
                <span style={{ fontSize: "11px", color: "#F87171", lineHeight: 1.5 }}>{durationErr}</span>
              </div>
            )}
          </div>

          <div style={{ height: "1px", background: "#111", margin: "18px 0" }} />

          {/* Reference image, background only */}
          {mode === "background" && (
            <>
              <div style={{ padding: "0 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <p style={{ fontSize: "10px", fontWeight: 600, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                    Reference image
                  </p>
                  <span style={{ fontSize: "10px", color: "#222" }}>optional</span>
                </div>

                {!refImageUrl ? (
                  <button
                    onClick={() => { if (!job) refInputRef.current?.click(); }}
                    disabled={!!job}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                      gap: "8px", padding: "10px", borderRadius: "7px", cursor: job ? "default" : "pointer",
                      background: "transparent", border: "1px solid #1c1c1c", color: "#333",
                      fontSize: "12px", transition: "border-color 0.12s, color 0.12s",
                    }}
                    onMouseEnter={e => { if (!job) { (e.currentTarget as HTMLElement).style.borderColor = "#2a2a2a"; (e.currentTarget as HTMLElement).style.color = "#555"; } }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "#1c1c1c"; (e.currentTarget as HTMLElement).style.color = "#333"; }}
                  >
                    <ImageIcon style={{ width: 13, height: 13 }} />
                    Upload reference image
                  </button>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={refImageUrl} alt="" style={{
                      width: "48px", height: "30px", objectFit: "cover",
                      borderRadius: "5px", border: "1px solid #1a1a1a", flexShrink: 0,
                    }} />
                    <span style={{ fontSize: "11px", color: "#444", flex: 1 }}>Reference set</span>
                    {!job && (
                      <button onClick={removeRef} style={{ background: "none", border: "none", color: "#2e2e2e", cursor: "pointer", padding: "2px", display: "flex" }}>
                        <X style={{ width: 12, height: 12 }} />
                      </button>
                    )}
                  </div>
                )}
                <input ref={refInputRef} type="file" accept="image/*" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleRefImage(f); }} />
              </div>
              <div style={{ height: "1px", background: "#111", margin: "18px 0" }} />
            </>
          )}

          {/* Prompt */}
          <div style={{ padding: "0 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <p style={{ fontSize: "10px", fontWeight: 600, color: "#2a2a2a", textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                Prompt
              </p>
              <button
                onClick={handleEnhance}
                disabled={!prompt.trim() || enhancing || !!job}
                title="Enhance with AI"
                style={{
                  display: "flex", alignItems: "center", gap: "5px",
                  padding: "4px 10px", borderRadius: "5px", border: "none",
                  background: (!prompt.trim() || enhancing || !!job) ? "transparent" : "rgba(57,255,106,0.07)",
                  color:      (!prompt.trim() || enhancing || !!job) ? "#252525"    : GREEN,
                  fontSize: "11px", fontWeight: 600, cursor: (!prompt.trim() || enhancing || !!job) ? "not-allowed" : "pointer",
                  outline: (!prompt.trim() || enhancing || !!job) ? "none" : "1px solid rgba(57,255,106,0.15)",
                  transition: "all 0.15s",
                }}
              >
                {enhancing
                  ? <><Loader2 style={{ width: 10, height: 10, animation: "spin 0.8s linear infinite" }} /> Enhancing…</>
                  : <><Wand2 style={{ width: 10, height: 10 }} /> Enhance</>
                }
              </button>
            </div>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={!!job}
              placeholder={
                mode === "background"
                  ? "e.g. Cinematic rooftop at golden hour, city skyline in the background, warm ambient light, shallow depth of field"
                  : "e.g. Soft rim light from the left, deep blue cold fill from the right, foggy atmosphere, cinematic grade"
              }
              rows={4}
              style={{
                width: "100%", padding: "11px 12px", borderRadius: "7px",
                background: "#060606", border: "1px solid #161616",
                color: "white", fontSize: "12px", resize: "none",
                outline: "none", lineHeight: 1.65, boxSizing: "border-box",
                fontFamily: "inherit", opacity: job ? 0.4 : 1,
                transition: "border-color 0.15s",
              }}
              onFocus={e  => { (e.target as HTMLTextAreaElement).style.borderColor = "#2a2a2a"; }}
              onBlur={e   => { (e.target as HTMLTextAreaElement).style.borderColor = "#161616"; }}
            />
          </div>

          {/* Spacer */}
          <div style={{ flex: 1, minHeight: "20px" }} />

          {/* Generate button */}
          <div style={{ padding: "16px 20px 24px", borderTop: "1px solid #111" }}>
            {trialUsed && !isWorking && job?.stage !== "generating" ? (
              <a
                href="/dashboard/billing"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  gap: "7px", width: "100%", padding: "13px",
                  background: GREEN, color: "#000", fontWeight: 700,
                  fontSize: "13px", borderRadius: "8px", textDecoration: "none",
                  boxSizing: "border-box",
                }}
              >
                <Zap style={{ width: 13, height: 13 }} />
                Upgrade to continue
              </a>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!canGenerate || isWorking}
                style={{
                  width: "100%", padding: "13px", borderRadius: "8px", border: "none",
                  background: (!canGenerate || isWorking) ? "#0f0f0f" : GREEN,
                  color:      (!canGenerate || isWorking) ? "#252525"  : "#000",
                  fontWeight: 700, fontSize: "13px",
                  cursor: (!canGenerate || isWorking) ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  transition: "background 0.15s, color 0.15s",
                  outline: (!canGenerate || isWorking) ? "none" : `1px solid rgba(57,255,106,0.25)`,
                  boxShadow: (!canGenerate || isWorking) ? "none" : "0 4px 20px rgba(57,255,106,0.15)",
                }}
              >
                {isWorking ? (
                  <><Loader2 style={{ width: 13, height: 13, animation: "spin 0.8s linear infinite" }} /> Processing…</>
                ) : (
                  <><Play style={{ width: 13, height: 13 }} /> Generate free</>
                )}
              </button>
            )}

            <p style={{ fontSize: "10px", color: "#1c1c1c", textAlign: "center", margin: "10px 0 0" }}>
              One free generation per account
            </p>
          </div>

        </div>
      </div>

      {/* Trial complete, premium upsell overlay */}
      {trialUsed && !job && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.92)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px",
        }}>
          <div style={{
            position: "relative",
            maxWidth: "480px", width: "100%",
            background: "linear-gradient(160deg, #0e0e0e 0%, #080808 100%)",
            border: "1px solid #1a1a1a",
            borderTop: "1px solid #222",
            borderRadius: "20px",
            padding: "52px 44px 44px",
            textAlign: "center",
            overflow: "hidden",
          }}>
            {/* Ambient glow */}
            <div style={{
              position: "absolute", top: "-60px", left: "50%", transform: "translateX(-50%)",
              width: "280px", height: "160px",
              background: "radial-gradient(ellipse at 50% 0%, rgba(57,255,106,0.12) 0%, transparent 70%)",
              pointerEvents: "none",
            }} />

            {/* Top rule */}
            <div style={{
              position: "absolute", top: 0, left: "20%", right: "20%", height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(57,255,106,0.4), transparent)",
            }} />

            {/* Icon */}
            <div style={{
              width: "64px", height: "64px", borderRadius: "16px", margin: "0 auto 28px",
              background: "radial-gradient(circle at 40% 35%, rgba(57,255,106,0.18), rgba(57,255,106,0.04) 70%)",
              border: "1px solid rgba(57,255,106,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 0 32px rgba(57,255,106,0.08), inset 0 1px 0 rgba(57,255,106,0.15)",
            }}>
              <CheckCircle style={{ width: 26, height: 26, color: GREEN }} />
            </div>

            {/* Label */}
            <p style={{
              fontSize: "11px", fontWeight: 500, color: "rgba(57,255,106,0.5)",
              letterSpacing: "0.12em", textTransform: "uppercase", margin: "0 0 16px",
            }}>
              Free trial
            </p>

            <h3 style={{
              fontSize: "28px", fontWeight: 800, color: "white",
              margin: "0 0 10px", letterSpacing: "-0.8px", lineHeight: 1.1,
            }}>
              You saw what it can do.
            </h3>
            <p style={{
              fontSize: "14px", color: "#484848", margin: "0 0 36px",
              lineHeight: 1.7, maxWidth: "320px", marginLeft: "auto", marginRight: "auto",
            }}>
              Your free generation is complete. Upgrade to unlock full-length videos, all four modes, and unlimited renders.
            </p>

            {/* Plan comparison row */}
            <div style={{
              display: "flex", gap: "8px", marginBottom: "28px",
            }}>
              {[
                { label: "Background", active: true },
                { label: "Relight",    active: true },
                { label: "VFX",        active: false },
                { label: "Style",      active: false },
              ].map(({ label, active }) => (
                <div key={label} style={{
                  flex: 1, padding: "8px 4px", borderRadius: "8px", textAlign: "center",
                  background: active ? "rgba(57,255,106,0.05)" : "#0a0a0a",
                  border: `1px solid ${active ? "rgba(57,255,106,0.15)" : "#131313"}`,
                }}>
                  <span style={{
                    fontSize: "11px", fontWeight: 500,
                    color: active ? "rgba(57,255,106,0.7)" : "#252525",
                  }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <a
              href="/dashboard/billing"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: "100%", padding: "15px",
                background: "linear-gradient(160deg, #44ff74 0%, #29d955 55%, #22c24a 100%)",
                color: "#000", fontWeight: 700, fontSize: "14px", letterSpacing: "-0.2px",
                borderRadius: "11px", textDecoration: "none",
                boxShadow: "0 1px 0 rgba(255,255,255,0.25) inset, 0 8px 32px rgba(57,255,106,0.22), 0 2px 8px rgba(0,0,0,0.4)",
                boxSizing: "border-box",
                transition: "opacity 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              Get started
            </a>

            {/* Trust signals */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              gap: "8px", marginTop: "20px", flexWrap: "wrap",
            }}>
              {[
                { text: "7-day guarantee", color: "rgba(57,255,106,0.55)",  bg: "rgba(57,255,106,0.05)",  border: "rgba(57,255,106,0.12)" },
                { text: "Cancel anytime",  color: "rgba(255,255,255,0.25)", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" },
                { text: "From $29.90/mo", color: "rgba(255,255,255,0.25)", bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.07)" },
              ].map(({ text, color, bg, border }) => (
                <span key={text} style={{
                  fontSize: "11px", fontWeight: 500, color,
                  background: bg, border: `1px solid ${border}`,
                  padding: "4px 10px", borderRadius: "6px",
                }}>
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        textarea::placeholder { color: #282828; }
        textarea::-webkit-scrollbar { width: 4px; }
        textarea::-webkit-scrollbar-track { background: transparent; }
        textarea::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 2px; }

        /* ── Playground responsive layout ── */
        .pg-main {
          flex: 1;
          display: flex;
          flex-direction: row;
          overflow: hidden;
        }
        .pg-preview {
          flex: 1;
          background: #050505;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          min-height: 0;
        }
        .pg-panel {
          width: 300px;
          border-left: 1px solid #111;
          background: #090909;
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          overflow-y: auto;
        }

        /* Mobile, stack vertically */
        @media (max-width: 640px) {
          .pg-main {
            flex-direction: column;
            overflow: auto;
          }
          .pg-preview {
            padding: 16px;
            flex: none;
            min-height: 0;
          }
          .pg-panel {
            width: 100%;
            border-left: none;
            border-top: 1px solid #111;
            overflow-y: visible;
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  );
}
