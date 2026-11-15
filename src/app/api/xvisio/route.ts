// Xvisio is temporarily disabled.
export async function POST() {
  return Response.json(
    { error: "L’assistant IA est temporairement désactivé." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
