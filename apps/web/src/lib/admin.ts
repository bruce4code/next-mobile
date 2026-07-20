export function isAdminEmail(email: string | null | undefined) {
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  return !!email && allowedEmails.includes(email.toLowerCase())
}
