import React from "react";
const TEAL = "#0D7377";

export function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange}
      className="relative flex-shrink-0"
      style={{ width: 36, height: 20, borderRadius: 10, background: checked ? TEAL : "#d1d5db", transition: "background 0.2s" }}>
      <span style={{
        position: "absolute", top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: 8,
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}
