import { getUserDeepSeekKey } from './localdb/users';

/**
 * Resolve which DeepSeek API key to use for a given user.
 * Precedence:
 *   1. The user's own key, set via /settings (preferred)
 *   2. The server-wide DEEPSEEK_API_KEY env var (fallback for admin-style deployments)
 *
 * Throws with a user-actionable message if neither is present, so callers can
 * surface that to the UI (e.g. redirect to /settings with an error banner).
 */
export async function resolveDeepSeekApiKey(userId: string): Promise<string> {
  const userKey = await getUserDeepSeekKey(userId);
  if (userKey) return userKey;
  const envKey = process.env['DEEPSEEK_API_KEY'];
  if (envKey) return envKey;
  throw new Error(
    '未配置 DeepSeek API key。到 /settings 填入你的 key，或让管理员在服务器上设置 DEEPSEEK_API_KEY。',
  );
}
