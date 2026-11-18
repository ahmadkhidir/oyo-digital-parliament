/**
 * The en-NG interface copy (`apps/web/AGENTS.md`: "All interface strings resolve from `messages/`
 * for en-NG and yo-NG"). This file is the shape the yo-NG catalogue must satisfy key for key.
 *
 * The voice is `branding.md` Tone of Voice: direct and specific, no superlatives, no advertising,
 * and a refusal stated in the same voice as an acceptance. Sentences are never assembled from
 * fragments; the few data values a screen shows (a duration, an attempt count, a telephone number)
 * arrive through placeholders that the i18n helpers substitute.
 */
export const enNG = {
  brand: {
    name: 'Oyo Digital Parliament',
    tagline: 'Your ward, on the record.',
  },
  shell: {
    skipToContent: 'Skip to the main content',
    mainLabel: 'Content',
  },
  footer: {
    disclosure:
      'Oyo Digital Parliament is a campaign instrument, not a government body. It holds residents\u2019 proposals on a public record and publishes the campaign\u2019s answers to them.',
    navLabel: 'The record',
    links: {
      commitments: 'Commitment register',
      ledger: 'Public ledger',
      reportCard: 'Quarterly report card',
      myRecord: 'My Record',
      privacy: 'Privacy notice',
      contact: 'Contact',
    },
    languageLegend: 'Language',
    languageApply: 'Apply',
    languages: { 'en-NG': 'English', 'yo-NG': 'Yor\u00f9b\u00e1' },
  },
  join: {
    title: 'Join',
    heading: 'Join the record',
    publicationHeading: 'What becomes public',
    publicationBody:
      'Your display name is the only part of you that is published. Your full name, your telephone number and your age are held privately and never shown on the record.',
    eligibility:
      'Registration is open to residents of Oyo State aged 18 to 35. The age you declare below is checked against that band, and no account is created outside it.',
    privacyLink: 'Read the privacy notice first',
    pendingNotice:
      'You already have a registration waiting for its code. The form below keeps what you typed.',
    errorSummaryHeading: 'Check these fields before sending',
    fields: {
      fullName: {
        label: 'Your full name',
        hint: 'Held privately. Never published, never shown on the record.',
        errors: {
          REQUIRED: 'Enter your full name.',
          TOO_LONG: 'That name is too long to hold. Keep it under 160 characters.',
        },
      },
      declaredAge: {
        label: 'Your age',
        hint: 'The band this platform is built for: 18 to 35.',
        errors: {
          REQUIRED: 'Enter your age.',
          OUT_OF_BAND: 'Registration is for ages 18 to 35. No account was created.',
        },
      },
      telephoneNumber: {
        label: 'Telephone number',
        hint: 'The number the confirmation code is sent to. A Nigerian number, for example +234 803 123 4567.',
        errors: {
          REQUIRED: 'Enter the telephone number the code should go to.',
          PATTERN_MISMATCH:
            'That is not a Nigerian mobile number we can text. Use +234 followed by ten digits.',
          ALREADY_SET: 'That number already has an account. Sign in to it instead.',
        },
      },
      displayName: {
        label: 'Display name',
        optional: 'optional',
        hint: 'The only name shown on the record. Leave it blank and one is made from your first name.',
        errors: {
          TOO_LONG: 'That display name is too long. Keep it under 60 characters.',
        },
      },
    },
    displayNamePreviewTyped: 'Will appear as: {name}',
    displayNamePreviewBlank: 'Left blank, a name is made from your first name.',
    sendCode: 'Send the code',
    sending: 'Sending the code',
    pendingStatus: 'A registration from this browser is still waiting for its code.',
    deliveryDelayedHeading: 'The code could not be sent',
    deliveryDelayedBody:
      'Your registration is held for 24 hours from now and no account exists. Continue to the confirmation screen, where you can ask for the code again.',
    deliveryDelayedContinue: 'Continue to confirm your number',
    alreadyRegistered: 'That number already has an account. Sign in to it instead.',
    signIn: 'Sign in',
    rateLimited: 'That is too many attempts. Wait {duration}, then try again.',
    degraded:
      'The service could not take the registration just now. Nothing was created, and what you typed is still here. Try again.',
    expiredRegistration: 'That registration has expired. Start again below with a fresh code.',
    offline: 'You are offline. The form is held; it sends when the connection returns.',
    offlineSubmit: 'Send when back online',
  },
  confirm: {
    title: 'Confirm your number',
    heading: 'Confirm your number',
    numberIntro: 'We sent a six-digit code to {number}.',
    numberIntroHeld:
      'We could not send the first code to {number}. Your registration is held for 24 hours; ask for the code below.',
    codeLabel: 'The six digits from the message',
    codeHint: 'It can take a minute to arrive.',
    codeErrors: {
      REQUIRED: 'Enter the six digits from the message.',
      PATTERN_MISMATCH: 'Enter six digits, numbers only.',
    },
    confirm: 'Confirm the code',
    confirming: 'Checking the code',
    resend: 'Send a new code',
    resending: 'Sending a new code',
    resendCountdown: 'You can ask for a new code in {duration}.',
    resendReady: 'You can ask for a new code now.',
    resendStaticNote: 'You can ask for a new code one minute after the last one was sent.',
    deliveryNote:
      'Delivery can take a minute. If no message arrives, ask for another code below \u2014 your registration is held until the 24-hour window closes.',
    changeNumber: 'That is the wrong number',
    incorrectTwo: 'That code is not right. You have {attempts} tries left.',
    incorrectOne: 'That code is not right. You have one try left.',
    attemptsExhausted: 'The tries are used up. Wait {duration}, then enter a fresh code.',
    expired: 'That code has expired. Ask for a new one below.',
    expiredRegistration:
      'That registration has run out of time. Start again on the registration form.',
    alreadyUsed: 'That code already created an account. Sign in to it instead.',
    resendFailed:
      'The message could not be sent just now. Your registration is still held; try again in a moment.',
    resendRateLimited: 'A new code was just sent. Ask for another in {duration}.',
    resendCapReached: 'Too many codes have gone to this number. Try again in {duration}.',
    resendSent: 'A new code is on its way to {number}.',
    offline: 'You are offline. Your registration is held; confirm when the connection returns.',
    offlineSubmit: 'Confirm when back online',
    resendOffline: 'Send when back online',
    degraded: 'The service could not answer just now. Nothing changed; try again.',
    signIn: 'Sign in',
    backToForm: 'Back to the registration form',
  },
  signIn: {
    title: 'Sign in',
    heading: 'Sign in',
    intro: 'Enter the telephone number on your account. We send a six-digit code to it.',
    sessionEnded: 'Your session has ended. Sign in again to carry on.',
    telephoneNumber: {
      label: 'Telephone number',
      hint: 'The number your account uses. A Nigerian number, for example +234 803 123 4567.',
      errors: {
        REQUIRED: 'Enter the telephone number on your account.',
        PATTERN_MISMATCH:
          'That is not a Nigerian mobile number we can text. Use +234 followed by ten digits.',
      },
    },
    sendCode: 'Send the code',
    sending: 'Sending the code',
    codeIntro: 'We sent a six-digit code to {number}.',
    sharedIntro: 'More than one account uses {number}. Enter the code, then choose the account.',
    code: {
      label: 'The six digits from the message',
      hint: 'It can take a minute to arrive.',
    },
    codeErrors: {
      REQUIRED: 'Enter the six digits from the message.',
      PATTERN_MISMATCH: 'Enter six digits, numbers only.',
    },
    accountChoice: {
      legend: 'Which account is signing in?',
      option: 'Account {position} of {count}',
    },
    choiceRequired: 'Choose which account is signing in.',
    confirm: 'Sign in',
    confirming: 'Signing in',
    incorrectTwo: 'That code is not right. You have {attempts} tries left.',
    incorrectOne: 'That code is not right. You have one try left.',
    attemptsExhausted: 'The tries are used up. Wait {duration}, then enter a fresh code.',
    codeExpired: 'That code has expired. Send a new one below.',
    codeAlreadyUsed: 'That code has already been used. Send a new one below.',
    sendFailed: 'The code could not be sent just now. Try again in a moment.',
    rateLimited: 'That is too many attempts. Wait {duration}, then try again.',
    degraded: 'The service could not answer just now. Nothing changed; try again.',
    deliveryNote: 'Delivery can take a minute. If no message arrives, send another code below.',
    resend: 'Send a new code',
    resending: 'Sending a new code',
    resendCountdown: 'You can ask for a new code in {duration}.',
    resendReady: 'You can ask for a new code now.',
    resendStaticNote: 'You can ask for a new code one minute after the last one was sent.',
    useDifferentNumber: 'Use a different number',
    createAccountPrompt: 'No account on this number?',
    createAccount: 'Create one instead.',
    offline: 'You are offline. The form is held; it sends when the connection returns.',
    offlineSend: 'Send when back online',
    offlineConfirm: 'Sign in when back online',
    offlineResend: 'Send when back online',
  },
  wait: {
    seconds: '{seconds} seconds',
    oneSecond: 'one second',
    minutes: 'about {minutes} minutes',
    oneMinute: 'about one minute',
  },
} as const;

/** The catalogue shape; yo-NG must satisfy it key for key (`apps/web/AGENTS.md`). */
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };
export type Messages = Widen<typeof enNG>;
