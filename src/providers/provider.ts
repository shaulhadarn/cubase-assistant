import type { Command, Parameter, Snapshot } from "../core/contracts";
export interface ProposalRequest {
  snapshot: Snapshot;
  channelId: string;
  parameter: Parameter;
  target: number;
}
/** Providers can propose only. They never receive a bridge, engine or approval capability. */
export interface ProposalProvider {
  readonly label: string;
  propose(
    request: ProposalRequest,
    signal: AbortSignal,
  ): Promise<{ command: Command; rationale: string }>;
}
export class ManualDemoProvider implements ProposalProvider {
  readonly label = "Manual proposal • no AI";
  async propose(
    { snapshot: s, channelId, parameter, target }: ProposalRequest,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const ch = s.channels.find((c) => c.id === channelId);
    if (!ch) throw new Error("Select a channel.");
    return {
      command: {
        version: 1 as const,
        id: crypto.randomUUID(),
        type: "setParameter" as const,
        projectId: s.projectId,
        epoch: s.epoch,
        expectedRevision: s.revision,
        channelId,
        parameter,
        expected: ch[parameter],
        value: target,
      },
      rationale:
        "Manual demonstration of the approval workflow. No audio has been analyzed and no mix improvement is claimed.",
    };
  }
}
export class DisabledOpenAIProvider implements ProposalProvider {
  readonly label = "OpenAI Agents API • disabled";
  async propose(
    _request: ProposalRequest,
    _signal: AbortSignal,
  ): Promise<never> {
    throw new Error(
      "OpenAI integration is not implemented or enabled. See docs/openai.md.",
    );
  }
}
