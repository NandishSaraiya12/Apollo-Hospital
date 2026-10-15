import React from "react";

// Stacked connection banners for the doctor and the patient, kept as one
// component so two warnings never overlap on screen.

const TONE = {
  warn:  { accent: "#FF900C" }, // yellow-150
  ok:    { accent: "#40A954" }, // green-250
};

function WifiOffIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
      <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
      <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
      <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
      <circle cx="12" cy="20" r="1" fill={color} stroke="none" />
    </svg>
  );
}

function CheckCircleIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

const ICONS = { wifi: WifiOffIcon, ok: CheckCircleIcon };

function Alert({ tone = "warn", icon = "wifi", title, body }) {
  const accent = (TONE[tone] || TONE.warn).accent;
  const Icon = ICONS[icon] || WifiOffIcon;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        background: "rgba(27,27,30,0.96)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: "11px 14px",
        maxWidth: 380,
        minWidth: 260,
        boxShadow: "0 8px 32px rgba(0,0,0,0.55)",
        animation: "nqp-slidein 0.22s ease-out",
      }}
    >
      <div style={{ marginTop: 1, flexShrink: 0 }}><Icon color={accent} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: accent, fontWeight: 600, fontSize: 13, lineHeight: "18px", marginBottom: 3 }}>
          {title}
        </p>
        <p style={{ color: "rgba(255,255,255,0.68)", fontSize: 12, lineHeight: "17px" }}>{body}</p>
      </div>
    </div>
  );
}

export default function NetworkAlerts({ alerts = [] }) {
  if (!alerts.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      <style>{`
        @keyframes nqp-slidein {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {alerts.map((a) => (
        <Alert key={a.id} tone={a.tone} icon={a.icon} title={a.title} body={a.body} />
      ))}
    </div>
  );
}
