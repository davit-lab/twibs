// FaceVerification — the browser side of the biometric admin gate.
//
// Pipeline: camera -> real MediaPipe face detection -> server-issued random
// liveness challenge -> raw proof + face embedding uploaded to the edge
// function -> short-lived grant on server-side success. The server is
// authoritative for every decision; this component only orchestrates the CV
// pipeline and reflects its state. All failure copy is intentionally generic.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import CameraView, { useCamera } from './CameraView';
import FaceMesh from './FaceMesh';
import LivenessChallenge from './LivenessChallenge';
import VerificationStatus from './VerificationStatus';
import { useFaceDetection } from './useFaceDetection';
import { useFaceEmbedding } from './useFaceEmbedding';
import { useLivenessDetection } from './useLivenessDetection';
import { startChallenge, submitProof } from './verificationApi';
import type {
  FaceDetectionResult,
  FaceVerificationSuccess,
  IssuedChallenge,
  VerificationState,
} from './types';
import {
  CENTER_PITCH_MAX,
  CENTER_ROLL_MAX,
  CENTER_YAW_MAX,
  FACE_SIZE_MAX,
  FACE_SIZE_MIN,
  QUALITY_MIN,
} from '@/lib/security/faceLiveness';

interface FaceVerificationProps {
  mode: 'verify' | 'enroll';
  onSuccess?: (result: FaceVerificationSuccess) => void;
  onCancel?: () => void;
  className?: string;
}

const STABLE_FRAMES_REQUIRED = 10;

export default function FaceVerification({
  mode,
  onSuccess,
  onCancel,
  className,
}: FaceVerificationProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const meshRef = useRef<FaceDetectionResult['mesh']>([]);

  const [state, setState] = useState<VerificationState>('idle');
  const [challenge, setChallenge] = useState<IssuedChallenge | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);

  const stateRef = useRef(state);
  const challengeStartAtRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const submittingRef = useRef(false);
  const stableRef = useRef(0);

  const go = useCallback((next: VerificationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const goIf = useCallback((from: VerificationState[], next: VerificationState) => {
    setState((s) => {
      if (from.includes(s)) {
        stateRef.current = next;
        return next;
      }
      return s;
    });
  }, []);

  const camera = useCamera(videoRef);
  const faceDetection = useFaceDetection({ videoRef, enabled: camera.status === 'streaming' });
  const liveness = useLivenessDetection({
    enabled: state === 'liveness_in_progress',
    challenge,
    challengeStartAtRef,
  });
  const embeddingHook = useFaceEmbedding();

  // ---- Camera lifecycle ----------------------------------------------------
  useEffect(() => {
    if (camera.status === 'streaming') {
      goIf(
        ['idle', 'camera_initializing', 'camera_permission_required', 'camera_error'],
        'detecting_face',
      );
    } else if (camera.status === 'denied') {
      go('camera_permission_required');
    } else if (camera.status === 'error') {
      go('camera_error');
    }
  }, [camera.status, go, goIf]);

  // ---- Challenge issuance --------------------------------------------------
  const beginChallenge = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    const res = await startChallenge(mode);
    if (!res.ok) {
      startedRef.current = false;
      if (res.code === 'too_many_attempts') {
        go('too_many_attempts');
      } else {
        go(mode === 'enroll' ? 'liveness_failed' : 'face_match_failed');
      }
      return;
    }
    const issued = res.data!.challenge;
    setChallenge(issued);
    challengeStartAtRef.current = performance.now();
    go('liveness_in_progress');
  }, [mode, go]);

  // ---- Per-frame detection routing ----------------------------------------
  const handleDetection = useCallback(
    (res: FaceDetectionResult | null) => {
      meshRef.current = res?.mesh ?? [];
      const s = stateRef.current;

      if (s === 'liveness_in_progress') {
        liveness.feed(res);
        return;
      }
      if (s !== 'detecting_face' && s !== 'multiple_faces') return;
      if (!res?.signals) {
        stableRef.current = 0;
        return;
      }

      const sig = res.signals;
      if (sig.faceCount > 1) {
        stableRef.current = 0;
        if (s !== 'multiple_faces') go('multiple_faces');
        return;
      }
      if (s === 'multiple_faces') go('detecting_face');

      const faceOk =
        sig.faceSize >= FACE_SIZE_MIN &&
        sig.faceSize <= FACE_SIZE_MAX &&
        sig.quality >= QUALITY_MIN;
      const centered =
        Math.abs(sig.yaw) <= CENTER_YAW_MAX + 6 &&
        Math.abs(sig.pitch) <= CENTER_PITCH_MAX + 6 &&
        Math.abs(sig.roll) <= CENTER_ROLL_MAX + 6;

      stableRef.current = faceOk && centered ? stableRef.current + 1 : 0;
      if (stableRef.current >= STABLE_FRAMES_REQUIRED && !startedRef.current) {
        go('camera_ready');
        beginChallenge();
      }
    },
    [go, liveness, beginChallenge],
  );

  useEffect(() => {
    faceDetection.setOnResult(handleDetection);
    return () => faceDetection.setOnResult(null);
  }, [faceDetection, handleDetection]);

  // ---- Liveness -> submit --------------------------------------------------
  const retry = useCallback(() => {
    startedRef.current = false;
    stableRef.current = 0;
    submittingRef.current = false;
    setChallenge(null);
    challengeStartAtRef.current = null;
    liveness.reset();
    go('detecting_face');
  }, [liveness, go]);

  const submitLiveness = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    go('face_matching');

    const proof = liveness.buildProof();
    const issued = challenge;
    if (!proof || !issued) {
      submittingRef.current = false;
      go(mode === 'enroll' ? 'liveness_failed' : 'face_match_failed');
      return;
    }

    let embedding: number[] | null = null;
    try {
      // The recognition model loads in parallel with the liveness run; if it
      // is still initializing, give it a few seconds before giving up.
      let waited = 0;
      while (!embeddingHook.ready && waited < 8000) {
        await new Promise((r) => setTimeout(r, 250));
        waited += 250;
      }
      const video = videoRef.current;
      if (embeddingHook.ready && video && video.readyState >= 2 && video.videoWidth > 0) {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        embedding = await embeddingHook.extractEmbedding(canvas);
      }
    } catch {
      embedding = null;
    }

    if (!embedding) {
      submittingRef.current = false;
      go(mode === 'enroll' ? 'liveness_failed' : 'face_match_failed');
      return;
    }

    const res = await submitProof(mode, proof, issued.nonce, embedding);
    submittingRef.current = false;

    if (res.ok) {
      go('authentication_success');
      onSuccess?.(res.data ?? {});
      return;
    }
    if (res.code === 'too_many_attempts') {
      go('too_many_attempts');
      return;
    }
    if (res.code === 'challenge_expired') {
      retry();
      return;
    }
    go(mode === 'enroll' ? 'liveness_failed' : 'face_match_failed');
  }, [mode, liveness, challenge, embeddingHook, onSuccess, go, retry]);

  useEffect(() => {
    if (liveness.phase === 'satisfied' && state === 'liveness_in_progress') {
      submitLiveness();
    } else if (liveness.phase === 'failed' && state === 'liveness_in_progress') {
      go('liveness_failed');
    }
  }, [liveness.phase, state, submitLiveness, go]);

  // ---- Cooldown countdown for lockouts -------------------------------------
  useEffect(() => {
    if (state !== 'too_many_attempts') return;
    setCooldownSec(60);
    const id = setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [state]);

  const isCameraLive =
    state === 'detecting_face' ||
    state === 'multiple_faces' ||
    state === 'camera_ready' ||
    state === 'liveness_in_progress' ||
    state === 'face_matching';

  const showRetry =
    state === 'liveness_failed' ||
    state === 'face_match_failed' ||
    state === 'authentication_failed' ||
    state === 'too_many_attempts';

  return (
    <div className={className}>
      <div
        className="relative overflow-hidden rounded-2xl border border-border/70 bg-black"
        data-camera-root
      >
        <div className="aspect-video w-full">
          <CameraView videoRef={videoRef} className="h-full w-full">
            {isCameraLive && faceDetection.ready && <FaceMesh meshRef={meshRef} active={isCameraLive} />}

            {state === 'liveness_in_progress' && (
              <div className="absolute inset-x-3 bottom-3">
                <LivenessChallenge
                  instruction={liveness.activeInstruction}
                  instructionProgress={liveness.instructionProgress}
                  activeIndex={liveness.activeIndex}
                  total={challenge?.sequence.length ?? 0}
                  totalProgress={liveness.totalProgress}
                />
              </div>
            )}

            {(state === 'camera_permission_required' || state === 'camera_error') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/85 p-6 text-center">
                <VerificationStatus state={state} className="w-full max-w-sm border-0 bg-transparent" />
                <Button onClick={() => camera.start()} variant="outline">
                  {state === 'camera_permission_required' ? 'Enable camera' : 'Try again'}
                </Button>
              </div>
            )}

            {state === 'authentication_success' && (
              <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/10">
                <VerificationStatus state={state} className="max-w-sm border-0 bg-transparent" />
              </div>
            )}
          </CameraView>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {state !== 'liveness_in_progress' && state !== 'authentication_success' && (
          <VerificationStatus state={state} />
        )}

        {(showRetry || state === 'camera_error') && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {state === 'too_many_attempts'
                ? cooldownSec > 0
                  ? `Too many attempts. Try again in ${cooldownSec}s.`
                  : 'You can try again now.'
                : 'The check could not be completed.'}
            </p>
            <Button
              onClick={retry}
              disabled={state === 'too_many_attempts' && cooldownSec > 0}
              variant={state === 'too_many_attempts' ? 'secondary' : 'default'}
            >
              Try again
            </Button>
          </div>
        )}

        {onCancel && state !== 'liveness_in_progress' && state !== 'authentication_success' && (
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
