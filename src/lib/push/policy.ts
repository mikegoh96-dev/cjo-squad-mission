// Display copy for the notification policy. The policy itself is enforced on
// the server (private.notify_policy in the notifications_v2 migration); the
// wording lives in src/config/squad.ts and must stay in step with it.
import { squadConfig } from "../../config/squad.ts";

export const QUIET_HOURS_LABEL = squadConfig.notifications.quietHours;
export const RECAP_LABEL = squadConfig.notifications.recap;
