"use server";

import { createHash, randomBytes } from "node:crypto";
import { signIn, signOut } from "@/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Membership from "@/models/Membership";
import OrgSettings from "@/models/OrgSettings";
import { beginMembershipCheckout } from "@/lib/payments/membership";
import {
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";
import { isAdminRole } from "@/lib/permissions";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { sendPasswordResetEmail } from "@/lib/password-reset-email";

export type ActionResult = {
  success: boolean;
  error?: string;
};

const PASSWORD_RESET_MESSAGE =
  "If an account exists for that email, we’ll send a password reset link shortly. The link expires in 30 minutes.";

function getPasswordResetOrigin() {
  const configuredUrls = [process.env.AUTH_URL, process.env.NEXTAUTH_URL].filter(
    (value): value is string => Boolean(value)
  );
  if (configuredUrls.length === 0) {
    throw new Error("AUTH_URL or NEXTAUTH_URL must be configured.");
  }

  const urls = configuredUrls.map((value) => new URL(value));
  if (new Set(urls.map((url) => url.origin)).size > 1) {
    throw new Error("AUTH_URL and NEXTAUTH_URL must use the same origin.");
  }

  const url = urls[0];
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new Error("Password reset requires an HTTPS application URL in production.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
  ) {
    throw new Error("Password reset cannot use a localhost URL in production.");
  }

  return url.origin;
}

export async function registerUser(
  data: unknown
): Promise<ActionResult & {
  membershipId?: string;
  clientSecret?: string;
  approvalUrl?: string;
  accountCreated?: boolean;
}> {
  const parsed = registerSchema.safeParse(data);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message;
    return { success: false, error: firstError ?? "Invalid form data" };
  }

  const { firstName, lastName, email, password, paymentProvider } = parsed.data;
  let createdUserId: string | null = null;

  try {
    await connectDB();

    const existing = await User.findOne({ email });
    if (existing) {
      return { success: false, error: "An account with this email already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: "member",
      membershipStatus: "pending",
      isEmailVerified: false,
      isActive: true,
      // Explicit defaults so the fields exist in the document for directory queries
      privacySettings: {
        showEmail: false,
        showPhone: false,
        showCountry: true,
        showOccupation: true,
        isDirectoryVisible: true,
      },
    });
    createdUserId = user._id.toString();

    const orgSettings = await OrgSettings.findOne({});

    const membership = await Membership.create({
      user: user._id,
      memberSince: new Date(),
      membershipType: "regular",
      status: "pending",
      applicationStatus: "pending_payment",
      duesAmount: orgSettings?.membershipDuesAmount ?? 50,
      duesCurrency: orgSettings?.membershipDuesCurrency ?? "EUR",
    });

    const checkout = await beginMembershipCheckout(membership._id.toString(), paymentProvider);
    if (!checkout.success) {
      return {
        success: false,
        error: `Your account was created, but payment could not be started. Sign in to retry. ${checkout.error ?? ""}`.trim(),
        membershipId: membership._id.toString(),
        accountCreated: true,
      };
    }

    return {
      success: true,
      membershipId: membership._id.toString(),
      clientSecret: checkout.clientSecret,
      approvalUrl: checkout.approvalUrl,
    };
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    if (err?.code === 11000) {
      return {
        success: false,
        error: "An account with this email already exists. Sign in to resume membership payment.",
      };
    }
    console.error("Registration error:", error);
    if (createdUserId) {
      return {
        success: false,
        error: "Your account was created, but payment could not be started. Sign in to retry.",
        accountCreated: true,
      };
    }
    return { success: false, error: "Something went wrong. Please try again." };
  }
}

export async function requestPasswordReset(
  email: unknown
): Promise<ActionResult & { message?: string }> {
  const parsed = requestPasswordResetSchema.safeParse({ email });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid email address" };
  }

  if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM) {
    console.error("[requestPasswordReset] Resend is not configured.");
    return { success: false, error: "Password reset is temporarily unavailable. Please try again later." };
  }

  let origin: string;
  try {
    origin = getPasswordResetOrigin();
  } catch (error) {
    console.error("[requestPasswordReset] Invalid application URL configuration", error);
    return { success: false, error: "Password reset is temporarily unavailable. Please try again later." };
  }

  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    await connectDB();
    const user = await User.findOneAndUpdate(
      {
        email: parsed.data.email,
        isActive: { $ne: false },
        $or: [
          { passwordResetSentAt: { $exists: false } },
          { passwordResetSentAt: { $lte: new Date(now.getTime() - 60_000) } },
        ],
      },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: new Date(now.getTime() + 30 * 60_000),
          passwordResetSentAt: now,
        },
      },
      { new: true }
    ).select("_id email");

    if (!user) return { success: true, message: PASSWORD_RESET_MESSAGE };

    const resetUrl = new URL("/auth/reset-password", origin);
    resetUrl.searchParams.set("token", token);

    try {
      await sendPasswordResetEmail(user.email, resetUrl.toString());
    } catch (error) {
      console.error("[requestPasswordReset] Reset email delivery failed", {
        userId: user._id.toString(),
        error: error instanceof Error ? error.message : "Unknown email delivery error",
      });
      try {
        await User.updateOne(
          { _id: user._id, passwordResetTokenHash: tokenHash },
          {
            $unset: {
              passwordResetTokenHash: 1,
              passwordResetExpiresAt: 1,
              passwordResetSentAt: 1,
            },
          }
        );
      } catch (cleanupError) {
        console.error("[requestPasswordReset] Failed to clear undelivered reset token", cleanupError);
      }
    }

    return { success: true, message: PASSWORD_RESET_MESSAGE };
  } catch (error) {
    console.error("[requestPasswordReset]", error);
    return { success: false, error: "Unable to process the password reset request right now." };
  }
}

export async function resetPassword(
  token: unknown,
  password: unknown,
  confirmPassword: unknown
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid password reset data" };
  }

  try {
    await connectDB();
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const hashedPassword = await bcrypt.hash(parsed.data.password, 12);
    const result = await User.updateOne(
      {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
        isActive: { $ne: false },
      },
      {
        $set: { password: hashedPassword },
        $unset: {
          passwordResetTokenHash: 1,
          passwordResetExpiresAt: 1,
          passwordResetSentAt: 1,
        },
      }
    );

    if (result.modifiedCount !== 1) {
      return { success: false, error: "This reset link is invalid or expired. Request a new one." };
    }

    return { success: true };
  } catch (error) {
    console.error("[resetPassword]", error);
    return { success: false, error: "Unable to reset the password right now. Please try again." };
  }
}

export async function loginUser(
  email: string,
  password: string,
  callbackUrl?: string
): Promise<ActionResult> {
  try {
    const headersList = await headers();
    // x-forwarded-host is the real domain on Vercel; avoids AUTH_URL normalization
    const fwdHost = headersList.get("x-forwarded-host");
    const host = fwdHost ?? headersList.get("host") ?? "localhost:3000";
    const proto = host.includes("localhost") ? "http" : "https";

    // No explicit destination requested (e.g. visiting /auth/login directly) — route admins to the dashboard
    let destination = callbackUrl;
    if (!destination) {
      await connectDB();
      const account = await User.findOne({ email: email.toLowerCase() }).select("role");
      destination = account && isAdminRole(account.role) ? "/admin" : "/portal";
    }

    const redirectTo = `${proto}://${host}${destination}`;

    await signIn("credentials", { email, password, redirectTo });
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { success: false, error: "Invalid email or password" };
        default:
          return { success: false, error: "Authentication failed. Please try again." };
      }
    }
    throw error;
  }
}

export async function logoutUser(): Promise<void> {
  const headersList = await headers();
  const fwdHost = headersList.get("x-forwarded-host");
  const host = fwdHost ?? headersList.get("host") ?? "localhost:3000";
  const proto = host.includes("localhost") ? "http" : "https";
  await signOut({ redirectTo: `${proto}://${host}/` });
}
