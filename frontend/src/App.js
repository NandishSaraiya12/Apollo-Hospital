import React from "react";
import { MeetingProvider } from "@videosdk.live/react-sdk";
import RecorderView from "./components/RecorderView";

// VideoSDK custom recording template.
// The template engine opens this page as
//   https://<host>/?meetingId=…&token=…&participantId=…
// `participantId` is appended by VideoSDK itself; joining with it keeps the
// recorder invisible to the doctor and patient.
export default function App() {
  const sp = new URLSearchParams(window.location.search);
  const meetingId = sp.get("meetingId") || "";
  const token = sp.get("token") || "";
  const participantId = sp.get("participantId") || undefined;

  if (!meetingId || !token) {
    return (
      <div className="fixed inset-0 bg-[#1b1b1e] flex items-center justify-center">
        <p className="text-[#919093] text-sm">Missing meetingId or token in the template URL.</p>
      </div>
    );
  }

  return (
    <MeetingProvider
      config={{
        meetingId,
        // The doctor/patient clients hide any participant named "recorder".
        name: "recorder",
        participantId,
        micEnabled: false,
        webcamEnabled: false,
      }}
      token={token}
      joinWithoutUserInteraction={true}
    >
      <RecorderView />
    </MeetingProvider>
  );
}
