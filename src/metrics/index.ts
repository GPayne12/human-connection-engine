// Law 2: the only metric that exists is a completed human contact event.
// Do not add trackSession, trackPageView, trackFeatureUse, or engagement metrics.

export interface ContactEvent {
  personId: string;
  type: "message" | "call" | "meeting" | "email" | "other";
  timestamp: Date;
}

export function trackContactEvent(event: ContactEvent): void {
  // Persisted via the Interaction store (Layer 1/2).
  // This hook is the single allowed instrumentation entry point.
  console.debug("[metric] contact_event", event.type, event.personId);
}
