export function GET() {
  return Response.json({ status: 'ok', service: 'newsroom', time: new Date().toISOString() });
}
