import { useEffect, useRef, useState } from "react";
import { useParticipant } from "@videosdk.live/react-sdk";

// Any one of these is enough to call a link bad.
// loss is a fraction (0-1); jitter is ms; bitrate is kbps.
//
// Calibrated against the SDK's own penalty curves (js-sdk: videoJitterPenalty,
// videoLossPenalty), which are tuned to ITU-T G.107/G.114.
//   loss  8%    → SDK penalty 45 → FAIR
//   jitter 80ms → SDK penalty 28 → past the SDK's own 70ms "high" flag
export const BAD = {
  loss: 0.08,
  jitter: 80,
  // A video stream this thin is effectively not getting through. Checked only
  // on video samples — Opus with DTX legitimately drops to a few kbps in
  // silence, so this floor would false-fire on the audio fallback.
  videoKbps: 15,
  // Fraction of the interval the picture was frozen, and share of frames the
  // decoder threw away (the SDK's own constants).
  frozenFraction: 0.08,
  droppedRatio: 0.06,
};

const POLL_MS = 2000;
// Asymmetric on purpose: ~6 s of bad samples to warn, ~10 s of clean ones to
// clear. One bad poll shouldn't raise the banner, and one good poll in the
// middle of a bad patch shouldn't drop it.
const BAD_SAMPLES = 3;
const GOOD_SAMPLES = 5;
// How long the "connection restored" confirmation stays up.
const RECOVERED_MS = 5000;
// Below this many packets in an interval the loss ratio is meaningless — a
// single lost packet out of 3 reads as 33%. Same guard the SDK uses
// (MIN_PACKETS_FOR_LOSS) before it will compute a loss percentage at all.
const MIN_PACKETS_FOR_LOSS = 20;
// Likewise for the dropped-frame ratio over a single 2 s interval.
const MIN_FRAMES_FOR_DROP_RATIO = 20;
// The first RTCP reports are noisy; the SDK skips this window too (`inRampUp`).
const GRACE_MS = 8000;

// Collapse all stats entries into one view. A simulcast stream reports one
// entry per layer: packets and bitrate add up, jitter is worst-case, and the
// cumulative freeze/frame counters take the highest.
function foldEntries(entries) {
  const out = {
    packetsLost: 0, totalPackets: 0, bitrate: 0, jitter: null,
    freezeSec: null, framesDropped: null, framesReceived: null,
  };
  for (const e of entries) {
    if (e.packetsLost != null) out.packetsLost += e.packetsLost;
    if (e.totalPackets != null) out.totalPackets += e.totalPackets;
    if (e.bitrate != null) out.bitrate += e.bitrate;
    if (e.jitter != null) out.jitter = Math.max(out.jitter ?? 0, e.jitter);
    if (e.totalFreezesDuration != null) out.freezeSec = Math.max(out.freezeSec ?? 0, e.totalFreezesDuration);
    if (e.framesDropped != null) out.framesDropped = Math.max(out.framesDropped ?? 0, e.framesDropped);
    if (e.framesReceived != null) out.framesReceived = Math.max(out.framesReceived ?? 0, e.framesReceived);
  }
  return out;
}

// Watches what reaches the recorder from one participant and reports whether
// their link is healthy.
//   status: "unknown" | "ok" | "unstable" | "recovered"
// "unknown" means not measured (disabled, or before the first confirmed
// samples). "recovered" is a short-lived state after a bad patch clears, so the
// UI can confirm things are fine again instead of the warning just vanishing.
export default function useNetworkWatch({ participantId, enabled = true }) {
  const { getVideoStats, getAudioStats } = useParticipant(participantId);
  const [status, setStatus] = useState("unknown");

  const badRef = useRef(0);
  const goodRef = useRef(0);
  const unstableRef = useRef(false);
  const recoveredTimerRef = useRef(null);
  // True while "connection restored" is still showing, so the per-sample
  // promotion below doesn't cut it short.
  const inRecoveredRef = useRef(false);

  useEffect(() => {
    if (!enabled || !participantId) {
      badRef.current = 0;
      goodRef.current = 0;
      unstableRef.current = false;
      inRecoveredRef.current = false;
      clearTimeout(recoveredTimerRef.current);
      setStatus("unknown");
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    // Freeze / frame counters are cumulative, so we need the previous reading
    // to turn them into "what happened during this interval".
    let prev = null;

    const poll = async () => {
      let entries = [];
      let isVideo = true;
      try {
        // Video first — it degrades first. Audio only when there's no camera.
        entries = (await getVideoStats()) ?? [];
        if (!entries.length) {
          entries = (await getAudioStats()) ?? [];
          isVideo = false;
        }
      } catch (e) {
        return; // transient — keep the current verdict
      }
      if (cancelled || !entries.length) return;

      const s = foldEntries(entries);
      const elapsedMs = prev ? Date.now() - prev.at : null;
      const deltaFreezeSec = prev && s.freezeSec != null && prev.freezeSec != null
        ? Math.max(0, s.freezeSec - prev.freezeSec) : null;
      const deltaDropped = prev && s.framesDropped != null && prev.framesDropped != null
        ? Math.max(0, s.framesDropped - prev.framesDropped) : null;
      const deltaReceived = prev && s.framesReceived != null && prev.framesReceived != null
        ? Math.max(0, s.framesReceived - prev.framesReceived) : null;
      prev = { at: Date.now(), freezeSec: s.freezeSec, framesDropped: s.framesDropped, framesReceived: s.framesReceived };

      if (Date.now() - startedAt < GRACE_MS) return;

      // Inbound totalPackets counts packets that ARRIVED, so lost ones have to
      // be added back in (matches the SDK's computeLossPercent).
      const lost = Math.max(0, s.packetsLost);
      const expected = s.totalPackets + lost;

      const lossBad = expected >= MIN_PACKETS_FOR_LOSS && lost / expected > BAD.loss;
      const jitterBad = s.jitter != null && s.jitter > BAD.jitter;
      const bitrateBad = isVideo && s.bitrate > 0 && s.bitrate < BAD.videoKbps;
      const frozenBad = deltaFreezeSec != null && elapsedMs > 0 &&
        deltaFreezeSec / (elapsedMs / 1000) > BAD.frozenFraction;
      const droppedBad = deltaDropped != null && deltaReceived >= MIN_FRAMES_FOR_DROP_RATIO &&
        deltaDropped / deltaReceived > BAD.droppedRatio;

      const isBad = lossBad || jitterBad || bitrateBad || frozenBad || droppedBad;

      badRef.current = isBad ? badRef.current + 1 : 0;
      goodRef.current = isBad ? 0 : goodRef.current + 1;

      if (!unstableRef.current && badRef.current >= BAD_SAMPLES) {
        unstableRef.current = true;
        inRecoveredRef.current = false;
        clearTimeout(recoveredTimerRef.current);
        setStatus("unstable");
      } else if (unstableRef.current && goodRef.current >= GOOD_SAMPLES) {
        unstableRef.current = false;
        inRecoveredRef.current = true;
        setStatus("recovered");
        recoveredTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          inRecoveredRef.current = false;
          setStatus("ok");
        }, RECOVERED_MS);
      } else if (!unstableRef.current && !inRecoveredRef.current && goodRef.current >= GOOD_SAMPLES) {
        setStatus("ok");
      }
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearTimeout(recoveredTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, enabled]);

  return status;
}
