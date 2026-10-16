import React, { useEffect, useRef, useState } from "react";
import { useMeeting, usePubSub } from "@videosdk.live/react-sdk";
import ParticipantTile from "./ParticipantTile";
import NetworkAlerts from "./NetworkAlerts";
import useNetworkWatch from "../hooks/useNetworkWatch";

const isRecorderName = (name) => name?.toLowerCase() === "recorder";

// Role from the participant's own data, when it says so.
function roleFromParticipant(p) {
  const metaRole = p?.metaData?.role?.toUpperCase?.();
  if (metaRole === "DOCTOR") return "doctor";
  if (metaRole === "PATIENT" || metaRole === "CUSTOMER") return "patient";
  const name = p?.displayName || "";
  if (/\bdoctor\b|\bdr\b\.?/i.test(name)) return "doctor";
  if (/\bpatient\b/i.test(name)) return "patient";
  return null;
}

// Records every sender of a pubsub topic. Only the patient client publishes
// DEVICE_INFO / GEO_TAG / GEO_FAILED and only the doctor client publishes
// VERIFICATION_STEP, so the sender tells us the role even if the display name
// was edited on the join screen.
function useSenders(topic, onSender) {
  usePubSub(topic, {
    onMessageReceived: ({ senderId }) => senderId && onSender(senderId),
    onOldMessagesReceived: (messages) =>
      messages.forEach(({ senderId }) => senderId && onSender(senderId)),
  });
}

function Tile({ label, participantId }) {
  return (
    <div className="relative flex-1 min-w-0 h-full rounded-[24px] overflow-hidden bg-[#303033]">
      {participantId ? (
        <ParticipantTile participantId={participantId} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <p className="text-[#919093] text-sm">Waiting for {label.toLowerCase()} to join…</p>
        </div>
      )}
      <span className="absolute top-3 left-3 z-10 px-2 py-0.5 rounded-md bg-black/50 text-white text-xs font-medium">
        {label}
      </span>
    </div>
  );
}

function networkAlertsFor(label, status) {
  if (status === "unstable") {
    return [{
      id: `${label}-unstable`,
      tone: "warn",
      icon: "wifi",
      title: `${label} has an unstable connection`,
      body: `The ${label.toLowerCase()}'s audio or video may be interrupted.`,
    }];
  }
  if (status === "recovered") {
    return [{
      id: `${label}-recovered`,
      tone: "ok",
      icon: "ok",
      title: `${label}'s connection restored`,
      body: `The ${label.toLowerCase()}'s audio and video are stable again.`,
    }];
  }
  return [];
}

export default function RecorderView() {
  const [joined, setJoined] = useState(false);
  const [meetingState, setMeetingState] = useState(null);

  // Sender ids seen per role. Kept as sets so a patient who rejoined with a new
  // id still resolves — only ids actually in the room are used below.
  const doctorIdsRef = useRef(new Set());
  const patientIdsRef = useRef(new Set());
  const [, bump] = useState(0);
  const addSender = (ref) => (id) => {
    if (ref.current.has(id)) return;
    ref.current.add(id);
    bump((n) => n + 1);
  };

  const { participants, localParticipant } = useMeeting({
    onMeetingJoined: () => setJoined(true),
    onMeetingStateChanged: ({ state }) => setMeetingState(state),
    onError: (e) => console.error("[Recorder] onError:", e),
  });

  useSenders("DEVICE_INFO", addSender(patientIdsRef));
  useSenders("GEO_TAG", addSender(patientIdsRef));
  useSenders("GEO_FAILED", addSender(patientIdsRef));
  useSenders("VERIFICATION_STEP", addSender(doctorIdsRef));

  // ── Who is who ─────────────────────────────────────────────────────────────
  const people = [...participants.values()].filter(
    (p) => p.id !== localParticipant?.id && !isRecorderName(p.displayName)
  );
  const ids = people.map((p) => p.id);

  let doctorId = ids.find((id) => doctorIdsRef.current.has(id));
  let patientId = ids.find((id) => id !== doctorId && patientIdsRef.current.has(id));
  if (!doctorId) doctorId = people.find((p) => p.id !== patientId && roleFromParticipant(p) === "doctor")?.id;
  if (!patientId) patientId = people.find((p) => p.id !== doctorId && roleFromParticipant(p) === "patient")?.id;
  // One known, the other is whoever is left. Neither known: join order
  // (the doctor creates the room and is normally in first).
  if (!patientId) patientId = ids.find((id) => id !== doctorId && (doctorId || id !== ids[0]));
  if (!doctorId) doctorId = ids.find((id) => id !== patientId);

  // Record the full-quality layer (the doctor sends simulcast), not a low one.
  const idsKey = ids.join(",");
  useEffect(() => {
    if (!joined) return;
    people.forEach((p) => {
      try { p.setQuality?.("high"); } catch (e) { /* noop */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joined, idsKey]);

  // ── Network alerts ─────────────────────────────────────────────────────────
  // "Our own link is fine" here means the recorder itself is connected: it runs
  // on VideoSDK's infrastructure, not someone's last mile. While it isn't, both
  // watches stand down (reset to "unknown"), so nobody gets blamed for our
  // outage. Each party is otherwise judged on its own stream — gating one on
  // the other would hide the case where both are bad, and release a stale
  // "unstable" the moment the other side cleared.
  const isConnected = joined && meetingState === "CONNECTED";
  const doctorNetwork = useNetworkWatch({
    participantId: doctorId,
    enabled: isConnected && !!doctorId,
  });
  const patientNetwork = useNetworkWatch({
    participantId: patientId,
    enabled: isConnected && !!patientId,
  });
  const networkAlerts = [
    ...networkAlertsFor("Doctor", doctorNetwork),
    ...networkAlertsFor("Patient", patientNetwork),
  ];

  return (
    <div className="fixed inset-0 bg-[#1b1b1e]">
      <NetworkAlerts alerts={networkAlerts} />
      <div className="h-full w-full flex flex-row gap-3 p-3">
        <Tile label="Doctor" participantId={doctorId} />
        <Tile label="Patient" participantId={patientId} />
      </div>
    </div>
  );
}
