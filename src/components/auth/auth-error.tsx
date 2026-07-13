/** The one shared error banner for the auth forms and pages. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">{message}</p>
  );
}
