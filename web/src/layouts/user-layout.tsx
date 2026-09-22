import type { ReactNode } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { isAppEmbedded } from "@/lib/agent/local-agent-connect-policy";

export default function UserLayout({ children }: { children: ReactNode }) {
    const embedded = isAppEmbedded();
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
            </div>
            {embedded ? null : <AgentPanel />}
        </div>
    );
}
