export function sandbox() {
  return process.env.NEWSROOM_MODE === 'sandbox';
}
export function appUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}
export function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Configure it securely on the server.`);
  return value;
}
export function log(
  level: 'info' | 'error' | 'warning',
  event: string,
  details: Record<string, unknown> = {}
) {
  console.log(JSON.stringify({ at: new Date().toISOString(), level, event, ...details }));
}
