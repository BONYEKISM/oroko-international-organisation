import "server-only";

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!apiKey || !from) {
    throw new Error("Resend password reset email is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Reset your OROKO International password",
      text: [
        "We received a request to reset your OROKO International password.",
        `Reset your password using this link: ${resetUrl}`,
        "This link expires in 30 minutes and can only be used once.",
        "If you did not request a reset, you can ignore this email.",
      ].join("\n\n"),
      html: `<p>We received a request to reset your OROKO International password.</p><p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 30 minutes and can only be used once.</p><p>If you did not request a reset, you can ignore this email.</p>`,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("[sendPasswordResetEmail] Resend request failed", {
      status: response.status,
    });
    throw new Error("Resend could not deliver the password reset email.");
  }
}
