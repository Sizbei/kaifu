/**
 * Plain non-streaming completion against Shisa, for callers that just
 * want text back (JUDGE). Lives apart from shisa.ts so the register
 * engine and the clause comparison can evolve independently, and so
 * this stays a five-line function rather than a fourth export on an
 * already-full module.
 */

import { createShisaClient } from "@/lib/shisa";
import type { Completer } from "@/lib/judge";

export const completeWithShisa: Completer = async (system, user) => {
  const client = createShisaClient();
  const res = await fetch(`${client.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${client.apiKey}`,
    },
    body: JSON.stringify({
      model: client.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
      temperature: 0.1,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) {
    throw new Error(`Shisa request failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
};
