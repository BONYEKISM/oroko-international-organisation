import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { createInterface } from "node:readline";

function askLine(question) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    readline.question(question, (answer) => {
      readline.close();
      resolve(answer.trim());
    });
  });
}

function askSecret(question) {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    return Promise.reject(new Error("Run this command from an interactive terminal."));
  }

  return new Promise((resolve, reject) => {
    let value = "";
    process.stdout.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    function finish(error) {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\u0003") {
          finish(new Error("Cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
        } else if (character >= " ") {
          value += character;
        }
      }
    }

    input.on("data", onData);
  });
}

async function main() {
  const mongoUri = await askSecret("Production MongoDB URI (input hidden): ");
  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    throw new Error("The database URI is invalid.");
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10_000 });
  } catch {
    throw new Error("Could not connect to that database. Check the production URI and try again.");
  }

  const { host, name } = mongoose.connection;
  if (!host || /(^localhost$|127\.0\.0\.1|::1)/i.test(host)) {
    throw new Error("Refusing to reset a password on a local database.");
  }

  console.log(`Connected to MongoDB host "${host}", database "${name}".`);
  const confirmation = await askLine('Type "RESET PRODUCTION SUPERADMIN PASSWORD" to continue: ');
  if (confirmation !== "RESET PRODUCTION SUPERADMIN PASSWORD") {
    throw new Error("Confirmation did not match; no changes were made.");
  }

  const email = (await askLine("Existing Super Admin email: ")).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }

  const users = mongoose.connection.collection("users");
  const user = await users.findOne(
    { email },
    { projection: { _id: 1, role: 1, isActive: 1 } }
  );
  if (!user || user.role !== "superadmin") {
    throw new Error("That email does not belong to an existing Super Admin account.");
  }
  if (user.isActive === false) {
    throw new Error("That Super Admin account is inactive.");
  }

  const password = await askSecret("New password (minimum 12 characters, input hidden): ");
  const confirmationPassword = await askSecret("Confirm new password (input hidden): ");
  if (password.length < 12) {
    throw new Error("Use a password with at least 12 characters.");
  }
  if (password !== confirmationPassword) {
    throw new Error("Passwords do not match.");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const result = await users.updateOne(
    { _id: user._id, role: "superadmin", isActive: { $ne: false } },
    { $set: { password: hashedPassword, updatedAt: new Date() } }
  );
  if (result.modifiedCount !== 1) {
    throw new Error("The account changed during this operation; no password was updated.");
  }

  console.log(`Password reset for ${email}. Sign in at https://www.orokointernational.com/auth/login.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Password reset failed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
