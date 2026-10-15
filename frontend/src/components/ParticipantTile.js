import React, { useEffect, useRef, useState } from "react";
import { useParticipant, VideoPlayer } from "@videosdk.live/react-sdk";
import MicOffSmallIcon from "../icons/MicOffSmallIcon";
import NetworkIcon from "../icons/NetworkIcon";
import { getQualityScore, nameTructed } from "../utils/common";

// 2 s is plenty for a quality badge; getStats() is not free.
const STATS_POLL_MS = 2000;

const QUALITY = {
  good: { color: "#3BA55D", label: "Good" },
  average: { color: "#faa713", label: "Average" },
  poor: { color: "#FF5D5D", label: "Poor" },
};

function qualityFromScore(score) {
  if (score > 7) return QUALITY.good;
  if (score > 4) return QUALITY.average;
  return QUALITY.poor;
}

// Colour-only badge (green / orange / red) from loss, jitter and RTT of the
// participant's active stream.
function NetworkBadge({ participantId }) {
  const { webcamStream, micStream, getVideoStats, getAudioStats } = useParticipant(participantId);
  const [quality, setQuality] = useState(QUALITY.good);

  useEffect(() => {
    if (!webcamStream && !micStream) return;
    let cancelled = false;
    const update = async () => {
      try {
        const stats = webcamStream ? await getVideoStats() : await getAudioStats();
        if (!cancelled && stats?.length) setQuality(qualityFromScore(getQualityScore(stats[0])));
      } catch (e) { /* stats unavailable — keep last value */ }
    };
    update();
    const id = setInterval(update, STATS_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webcamStream, micStream]);

  if (!webcamStream && !micStream) return null;

  return (
    <div
      className="absolute top-3 right-3 rounded-md flex items-center justify-center p-1.5"
      style={{ backgroundColor: quality.color }}
      title={`Network: ${quality.label}`}
    >
      <NetworkIcon color1="#fff" color2="#fff" color3="#fff" color4="#fff" style={{ height: 12, width: 12 }} />
    </div>
  );
}

function ParticipantTile({ participantId }) {
  const { displayName, micStream, webcamOn, micOn } = useParticipant(participantId);
  const micRef = useRef(null);

  // The template engine records the page's audio, so both parties must play here.
  useEffect(() => {
    const el = micRef.current;
    if (!el) return;
    if (!(micOn && micStream)) {
      el.srcObject = null;
      return;
    }
    el.srcObject = new MediaStream([micStream.track]);
    el.play().catch((error) => console.error("audioElem.play() failed", error));
  }, [micStream, micOn]);

  return (
    <div className="h-full w-full relative overflow-hidden video-contain">
      <audio ref={micRef} autoPlay />
      {webcamOn ? (
        <VideoPlayer
          participantId={participantId}
          type="video"
          containerStyle={{ height: "100%", width: "100%" }}
          className="h-full"
          classNameVideo="h-full"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <div className="flex items-center justify-center rounded-full bg-[#1b1b1e] h-[92px] w-[92px]">
            <p className="text-2xl text-white">{String(displayName).charAt(0).toUpperCase()}</p>
          </div>
        </div>
      )}

      <NetworkBadge participantId={participantId} />
      <div className="absolute bottom-2 left-2 rounded-md flex items-center p-2 bg-black/40">
        {!micOn && (
          <div className="flex items-center justify-center rounded-full mr-1.5 p-0.5 bg-[#D32F2Fcc]">
            <MicOffSmallIcon fillcolor="white" />
          </div>
        )}
        <p className="text-sm text-white">{nameTructed(displayName, 26)}</p>
      </div>
    </div>
  );
}

export default React.memo(ParticipantTile);
