import "server-only";

export function getApplicationOrigin() {
  const configuredUrls = [process.env.AUTH_URL, process.env.NEXTAUTH_URL].filter(
    (value): value is string => Boolean(value)
  );
  if (configuredUrls.length === 0) {
    throw new Error("AUTH_URL or NEXTAUTH_URL must be configured for payments.");
  }

  const urls = configuredUrls.map((value) => new URL(value));
  if (new Set(urls.map((url) => url.origin)).size > 1) {
    throw new Error("AUTH_URL and NEXTAUTH_URL must use the same origin.");
  }

  const url = urls[0];
  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:") {
      throw new Error("Payment return URLs must use HTTPS in production.");
    }
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      throw new Error("Payment return URLs cannot use localhost in production.");
    }
  }

  return url.origin;
}

export function getPaymentReturnUrl(provider: "paypal" | "stripe", flow: string) {
  const url = new URL("/payments/return", getApplicationOrigin());
  url.searchParams.set("provider", provider);
  url.searchParams.set("flow", flow);
  return url.toString();
}

export function getPaymentCancelUrl(flow: string) {
  const url = new URL("/payments/cancelled", getApplicationOrigin());
  url.searchParams.set("flow", flow);
  return url.toString();
}
