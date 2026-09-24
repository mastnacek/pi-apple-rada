// Shared harness state.
//
// These were module-level `let`s; a `let` cannot be reassigned from another
// module, so callers mutate one shared object instead.
export const harness = {
  /** Last completed deliberation, surfaced by /apple status. */
  lastDeliberation: null,
  /** Deliberation currently running, if any. */
  activeDeliberation: null,
  /** UI context captured from agent_start, used by the config wizard. */
  activeUi: null,
};
