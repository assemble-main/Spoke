/* eslint-disable max-classes-per-file */

import AuthHasher from "passport-local-authenticate";

import { capitalizeWord } from "./api/lib/utils";
import type { UserRecord } from "./api/types";
import type { SpokeDbContext } from "./contexts/types";

export interface HashedPassword {
  salt: string;
  hash: string;
}

interface AuthHelperOptions {
  db: SpokeDbContext;
  lowerCaseEmail: string;
  password: string;
  existingUser: UserRecord;
  nextUrl: string;
  uuidMatch: RegExpMatchArray | null;
  reqBody: any;
}

type AuthHelper = (options: AuthHelperOptions) => Promise<unknown>;

export class LocalAuthError extends Error {
  errorType: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    this.errorType = "LocalAuthError";
  }
}

export class SuspendedUserError extends LocalAuthError {
  constructor() {
    super("Your account is suspended. Contact your administrator.");
  }
}
export class InvalidInviteError extends LocalAuthError {
  constructor() {
    super("Invalid invite code. Contact your administrator.");
  }
}

export class InvalidCredentialsError extends LocalAuthError {
  constructor() {
    super("Invalid username or password");
  }
}

export class EmailTakenError extends LocalAuthError {
  constructor() {
    super("That email is already taken.");
  }
}

export class MismatchedPasswordsError extends LocalAuthError {
  constructor() {
    super("Passwords don't match.");
  }
}

export class InvalidResetHashError extends LocalAuthError {
  constructor() {
    super(
      "Invalid username or password reset link. Contact your administrator."
    );
  }
}

export class StalePasswordError extends LocalAuthError {
  constructor() {
    super("Old and new password can't be the same");
  }
}

const validUuid = async (
  db: SpokeDbContext,
  nextUrl: string,
  uuidMatch: RegExpMatchArray
) => {
  if (!nextUrl) throw new InvalidInviteError();

  let matchingRecord;
  if (nextUrl.includes("join")) {
    matchingRecord = await db
      .primary("organization")
      .where({ uuid: uuidMatch[0] })
      .first("id");
  } else if (nextUrl.includes("invite")) {
    const splitUrl = nextUrl.split("/");
    const inviteHash = splitUrl[splitUrl.length - 1];
    matchingRecord = await db
      .primary("invite")
      .where({ hash: inviteHash })
      .first("id");
  }

  if (!matchingRecord) throw new InvalidInviteError();
};

// eslint-disable-next-line no-unused-vars,@typescript-eslint/no-unused-vars
const login: AuthHelper = async (options) => {
  const { password, existingUser } = options;
  if (!existingUser) throw new InvalidCredentialsError();

  // Get salt and hash and verify user password
  const pwFieldSplit = existingUser.auth0_id.split("|");
  const hashed = {
    salt: pwFieldSplit[1] || "",
    hash: pwFieldSplit[2] || ""
  };
  return new Promise((resolve, reject) => {
    AuthHasher.verify(password, hashed, (err: Error, verified: boolean) => {
      if (err) reject(new LocalAuthError(err.message));
      if (verified) {
        resolve(existingUser);
      }
      reject(new InvalidCredentialsError());
    });
  });
};

const signup: AuthHelper = async (options) => {
  const {
    db,
    lowerCaseEmail,
    password,
    existingUser,
    nextUrl,
    uuidMatch,
    reqBody
  } = options;
  // Verify UUID validity
  // If there is an error, it will be caught on local strategy invocation
  await validUuid(db, nextUrl, uuidMatch || [""]);

  // Verify user doesn't already exist
  if (existingUser && existingUser.email === lowerCaseEmail) {
    throw new EmailTakenError();
  }

  // Verify password and password confirm fields match
  if (password !== reqBody.passwordConfirm) {
    throw new MismatchedPasswordsError();
  }

  // create the user
  return new Promise((resolve, reject) => {
    AuthHasher.hash(password, async (err: Error, hashed: HashedPassword) => {
      if (err) reject(new LocalAuthError(err.message));
      // .salt and .hash
      const passwordToSave = `localauth|${hashed.salt}|${hashed.hash}`;
      const [user] = await db
        .primary("user")
        .insert({
          email: lowerCaseEmail,
          auth0_id: passwordToSave,
          first_name: capitalizeWord(reqBody.firstName),
          last_name: capitalizeWord(reqBody.lastName),
          cell: reqBody.cell,
          is_superadmin: false,
          notification_frequency: reqBody.notificationFrequency
        })
        .returning("*");
      resolve(user);
    });
  });
};

const reset: AuthHelper = (options) => {
  const { db, password, existingUser, reqBody, uuidMatch } = options;
  if (!existingUser) {
    throw new InvalidResetHashError();
  }

  // Get user resetHash and date of hash creation
  const pwFieldSplit = existingUser.auth0_id.split("|");
  const [resetHash, datetime] = [pwFieldSplit[1], pwFieldSplit[2]];

  // Verify hash was created in the last day
  const isExpired = (Date.now() - parseInt(datetime, 10)) / 1000 / 60 / 60 > 24;
  if (isExpired) {
    throw new InvalidResetHashError();
  }

  // Verify the UUID in request matches hash in DB
  if (uuidMatch && uuidMatch[0] !== resetHash) {
    throw new InvalidResetHashError();
  }

  // Verify passwords match
  if (password !== reqBody.passwordConfirm) {
    throw new MismatchedPasswordsError();
  }

  // Save new user password to DB
  return new Promise((resolve, reject) => {
    AuthHasher.hash(password, async (err: Error, hashed: HashedPassword) => {
      if (err) reject(new LocalAuthError(err.message));
      // .salt and .hash
      const passwordToSave = `localauth|${hashed.salt}|${hashed.hash}`;
      const [updatedUser] = await db
        .primary("user")
        .update({ auth0_id: passwordToSave })
        .where({ id: existingUser.id })
        .returning("*");
      resolve(updatedUser);
    });
  });
};

interface ChangeOptions {
  db: SpokeDbContext;
  user: UserRecord;
  password: string;
  newPassword: string;
  passwordConfirm: string;
}

// Only used in the changeUserPassword GraphQl mutation
export const change = (options: ChangeOptions) => {
  const { db, user, password, newPassword, passwordConfirm } = options;
  const pwFieldSplit = user.auth0_id.split("|");
  const hashedPassword = {
    salt: pwFieldSplit[1],
    hash: pwFieldSplit[2]
  };

  // Verify password and password confirm fields match
  if (newPassword !== passwordConfirm) {
    throw new MismatchedPasswordsError();
  }

  // Verify old and new passwords are different
  if (password === newPassword) {
    throw new StalePasswordError();
  }

  return new Promise((resolve, reject) => {
    AuthHasher.verify(
      password,
      hashedPassword,
      (error: Error, verified: boolean) => {
        if (error) reject(new LocalAuthError(error.message));
        if (!verified) reject(new InvalidCredentialsError());
        return AuthHasher.hash(
          newPassword,
          async (err: Error, hashed: HashedPassword) => {
            if (err) reject(new LocalAuthError(err.message));
            const passwordToSave = `localauth|${hashed.salt}|${hashed.hash}`;
            const updatedUser = await db
              .primary("user")
              .update({ auth0_id: passwordToSave })
              .where({ id: user.id });
            resolve(updatedUser);
          }
        );
      }
    );
  });
};

export const hashPassword = async (password: string) => {
  return new Promise((resolve, reject) => {
    AuthHasher.hash(password, (err: any, hashed: any) => {
      if (err) return reject(err);
      return resolve(`localauth|${hashed.salt}|${hashed.hash}`);
    });
  });
};

export const authHelpers: Record<string, AuthHelper | any> = {
  login,
  signup,
  reset,
  hashPassword
};

export default authHelpers;
