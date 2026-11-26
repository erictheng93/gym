// Test-only: JSON response bodies are untyped at the HTTP boundary, so
// `await res.json()` is `any` here. Asserting the shape is each test's job.
interface Response {
  json(): Promise<any>
}
