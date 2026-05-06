"use client";

import dynamic from "next/dynamic";

const PouleShell = dynamic(() => import("@/components/wk/poule-shell"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0f0f10",
      }}
    >
      <div className="spinner" style={{ margin: 0 }} aria-hidden />
    </div>
  ),
});

export default function HomePage() {
  return <PouleShell />;
}
