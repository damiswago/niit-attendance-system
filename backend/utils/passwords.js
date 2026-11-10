import bcrypt from "bcrypt";

// One password rule for the whole system (creating a user, changing, resetting,
// and an admin setting a password for someone).
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72; // bcrypt only reads the first 72 bytes

export const PASSWORD_RULE_MESSAGE = `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_BYTES} characters`;

export const isAcceptablePassword = (password) =>
  typeof password === "string" &&
  password.length >= MIN_PASSWORD_LENGTH &&
  Buffer.byteLength(password) <= MAX_PASSWORD_BYTES;

export const hashPassword = (password) => bcrypt.hash(password, 10);

// Recorded whenever a password changes. Any login older than this moment stops
// working (see authMiddleware), so changing or resetting a password also signs
// the account out everywhere else. Whole seconds, because a token's issue time
// is in whole seconds.
export const passwordChangeStamp = () =>
  new Date(Math.floor(Date.now() / 1000) * 1000);