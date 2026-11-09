// Sends server errors to the deployment's logs (Vercel → Logs), with no request
// data: the digest matches what the student's error page shows.
export function onRequestError(error: unknown, request: { path: string; method: string }) {
  const digest = (error as { digest?: string }).digest ?? "none";
  const name = error instanceof Error ? error.name : "UnknownError";
  console.error(`[error] ${request.method} ${request.path.split("?")[0]} ${name} digest=${digest}`);
}
