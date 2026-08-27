/**
 * KAIFŪ prompt surface.
 *
 * Kept apart from the transport client on purpose: register wording is the
 * part of this product that gets tuned most often and by the people least
 * likely to want to read a fetch loop. Nothing here does I/O.
 *
 * Split by concern so each file stays readable: shared guardrails, the
 * per-register style sheets, the few-shot exemplars, the register prompt
 * builders, and the action-card prompts.
 */

export { actionCardSystemPrompt, actionCardUserPrompt } from "./action-card";
export { EXEMPLARS, exemplarBlock } from "./exemplars";
export { HONORIFIC_DIRECTION, REGISTER_SPECS } from "./register-specs";
export { registerSystemPrompt, registerUserPrompt } from "./registers";
export { GLOSS_DELIMITER, LEGAL_BOUNDARY, NO_INVENTION } from "./shared";
