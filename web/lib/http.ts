// Parse a response body as JSON without throwing. A failing server can return
// a 500/502 with an HTML or empty body; calling response.json() on that throws
// and would otherwise leave a form's submit hanging with the spinner stuck.
// Returns the parsed body, or null when the body isn't valid JSON. Typed as
// `any` to match the existing `await res.json()` call sites that read fields
// like data.userId / data.error directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJson(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
