"use client";

import dynamic from "next/dynamic";

const DeployPage = dynamic(() => import("./deploy-client"), {
  ssr: false,
  loading: () => <main className="min-h-dvh bg-paper" aria-label="Loading D17 deployer" />,
});

export default function Page() {
  return <DeployPage />;
}

