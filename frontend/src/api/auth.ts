import { apiFetch } from "./client";
import type { components } from "./schema";

export type MeResponse = components["schemas"]["MeResponse"];

/** GET /api/v1/auth/me：目前請求被視為的 user_id（初版固定 1）。受 REQ-AUTH-000 金鑰保護。 */
export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/api/v1/auth/me");
}
