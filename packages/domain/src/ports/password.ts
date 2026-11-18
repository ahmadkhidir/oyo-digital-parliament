/**
 * The credential-material ports (`NFR-021`, `NFR-024`, `NFR-020`).
 *
 * Three effects the identity rules cannot perform themselves, because they need a cryptographic
 * library rather than a decision: comparing a staff password against its stored hash, sealing the
 * second factor's shared secret at rest, and computing the time-based code and the single-use recovery
 * codes that go with it.
 *
 * The rules stay in `src/identity`: the digit count, the period, the one-step tolerance, the lock
 * thresholds and the recovery-code count arrive as arguments, so an adapter cannot quietly widen a bar
 * the specification fixed (`C-092`, `packages/domain/AGENTS.md` Discipline). What this module fixes is
 * the seam:
 *
 * - a password is **never** seen in plaintext beyond the call that compares or hashes it, and only an
 *   Argon2id hash at cost 12 or above is ever stored (`NFR-021`);
 * - the TOTP secret exists in plaintext only while a client is being shown it once, and the stored
 *   copy is sealed with AES-256-GCM under a key from the validated configuration (`NFR-024`);
 * - a recovery code is stored only as a hash, so a leaked table cannot be replayed as a sign-in.
 *
 * `packages/platform` implements these over Node's crypto library and `packages/db` declares the same
 * structural shapes, so neither package imports this file at runtime. Nothing here reads the clock:
 * the instant arrives as an argument in the `C-001` form, which keeps code computation reproducible in
 * a test.
 *
 * @module ports/password
 */

/**
 * Hashing and comparing staff passwords (`NFR-021`, `C-092`).
 *
 * The implementation is chosen once, in the composition root, and never varies by caller: an unknown
 * username and a wrong password must take the same work, which is why {@link verifyWithoutCredential}
 * exists rather than a caller skipping the comparison.
 */
export interface PasswordHasherPort {
  /**
   * Hash one password for storage.
   *
   * @param password - The plaintext the staff member chose or the operator handed over.
   * @returns A salted Argon2id hash at cost 12 or above, in the encoded form the implementation reads
   *   back. The plaintext is not retained anywhere by the adapter.
   */
  hash(password: string): Promise<string>;

  /**
   * Compare a password against a stored hash.
   *
   * @param passwordHash - The encoded hash as stored. A malformed hash refuses rather than throws, so a
   *   corrupted row cannot be mistaken for a degraded store.
   * @param password - The plaintext supplied at sign-in.
   * @returns Whether the password matches.
   */
  verify(passwordHash: string, password: string): Promise<boolean>;

  /**
   * Perform a comparison with no stored hash, so an unknown username costs what a wrong password costs
   * (`C-092`: the two must be indistinguishable).
   *
   * @param password - The plaintext supplied at sign-in. Discarded after the comparison.
   */
  verifyWithoutCredential(password: string): Promise<void>;
}

/**
 * Sealing the second factor's shared secret at rest (`NFR-024`, `schema.md` StaffCredential).
 *
 * `StaffCredential.totpSecretEncrypted` is the only place the secret is kept. It is shown once at
 * enrolment (`C-092`) and never returned again, so the adapter's job is narrow: make the stored value
 * useless without the key, and refuse a value that was tampered with rather than handing back
 * plaintext.
 */
export interface TotpSecretCipherPort {
  /**
   * Seal one secret.
   *
   * @param secret - The base32 TOTP secret, plaintext.
   * @returns A self-describing string carrying the version, the nonce, the authentication tag and the
   *   ciphertext. Two seals of the same secret differ, because the nonce is fresh each time.
   */
  seal(secret: string): string;

  /**
   * Open a sealed secret.
   *
   * @param sealed - The stored value, exactly as {@link seal} produced it.
   * @returns The plaintext secret.
   * @throws when the value is malformed, the tag does not authenticate, or the key is wrong. A caller
   *   reports the credential store as unavailable; it never falls back to an unverified secret.
   */
  open(sealed: string): string;
}

/** The parameters a time-based code is computed with. They come from the rules, not the adapter. */
export interface TotpParameters {
  /** Decimal digits in the code. `C-092` prints six. */
  readonly digits: number;
  /** Length of one time step, in seconds. `C-092` prints thirty. */
  readonly periodSeconds: number;
  /** Steps of tolerance either side of the current one. `C-092` prints one. */
  readonly windowSteps: number;
}

/** One enrolment's presentation material (`C-092`, enrolment begin). */
export interface TotpEnrolmentRequest {
  /** The account name inside the `otpauth://` label: the staff username, never a member value. */
  readonly account: string;
  /** The issuer the authenticator displays. */
  readonly issuer: string;
  readonly algorithm: 'SHA1';
  readonly digits: number;
  readonly periodSeconds: number;
}

/**
 * The second factor's code mathematics and its recovery codes.
 *
 * Every method is a pure function of its arguments, so the adapter holds no per-credential state: the
 * secret is passed in each time, which is what keeps a verification from depending on a previous one.
 */
export interface SecondFactorPort {
  /** Mint a fresh shared secret: random bytes, base32, no padding. */
  generateSecret(): string;

  /**
   * Build the `otpauth://totp/...` URI an authenticator app scans (`C-092`).
   *
   * @param input - The secret and the parameters the authenticator must use.
   */
  otpauthUri(input: TotpEnrolmentRequest & { readonly secret: string }): string;

  /**
   * Whether a supplied code is valid for the secret at the given instant.
   *
   * @param input - The secret, the code, the instant and the tolerance.
   */
  verifyCode(
    input: TotpParameters & {
      readonly secret: string;
      readonly code: string;
      /** The instant the code is checked against, in the `C-001` form. */
      readonly at: string;
    },
  ): boolean;

  /**
   * Mint recovery codes, formatted for a person to copy.
   *
   * @param count - How many. `C-092` issues ten.
   */
  generateRecoveryCodes(count: number): readonly string[];

  /**
   * The value stored for one recovery code.
   *
   * @param code - The code as it was shown, with or without its grouping.
   * @returns A one-way digest. The adapter normalises the grouping first, so a reader who types the
   *   code without dashes is still accepted.
   */
  hashRecoveryCode(code: string): string;
}
