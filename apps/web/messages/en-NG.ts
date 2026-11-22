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
  ward: {
    title: 'Your ward',
    heading: 'Which ward do you live in?',
    intro:
      'Describe your area the way you would say it out loud. We suggest ward names; you choose the one that fits.',
    areaLabel: 'Local government area',
    areaHint:
      'Choose the local government area first. It narrows the list and tells apart wards that share a name.',
    areaPlaceholder: 'Select a local government area',
    descriptionLabel: 'Describe your area',
    descriptionHint:
      'A landmark, a street or the name you use for the area. Your own words are enough.',
    descriptionPlaceholder: 'For example: behind Agbowo market, near the express',
    suggesting: 'Looking for your ward',
    candidatesLegend: 'Ward suggestions',
    candidateOption: '{name} — {area}',
    noCandidates:
      'No ward in the reference matches those words. Your area is still accepted; send it for review below.',
    candidateError:
      'The ward list could not be read just now. Your words are still enough; send them for review below.',
    areaRequired:
      'More than one ward carries that name. Choose your local government area above so the right one can be offered.',
    confirm: 'Confirm ward',
    confirming: 'Recording your ward',
    noneOfThese: 'None of these',
    noneOfTheseHint:
      'Choose this if no suggestion is your area. A reviewer will confirm it, and you can carry on.',
    unresolvedHeading: 'If your area is not on the list',
    unresolvedNote:
      'It is still accepted. It stays unresolved until a reviewer confirms it, and your account keeps working.',
    recordedHeading: 'Your ward is recorded',
    recordedBody: 'Your record is placed in {ward}. You can change it below if that is wrong.',
    sentHeading: 'Area sent for confirmation',
    sentBody:
      'Your area will be reviewed and confirmed. You can carry on now; nothing is blocked while it is unresolved.',
    sentContinue: 'Continue to the record',
    errors: {
      descriptionRequired: 'Describe your area before sending.',
      descriptionLong: 'That description is too long. Keep it under 500 characters.',
      areaLong: 'That local government area is too long.',
      choiceRequired: 'Choose a suggested ward, or choose None of these.',
      wardUnknown:
        'That ward is no longer in the reference. Choose another suggestion, or send your words for review.',
      writeFailed:
        'The ward could not be recorded just now. Nothing changed, and your words are still here. Try again.',
      idempotencyRequired: 'The form expired before it was sent. Check your words and try again.',
      idempotencyConflict:
        'This form was already sent with different words. Check them and try again.',
    },
    offline: 'You are offline. Your words are held; the form sends when the connection returns.',
    offlineSubmit: 'Send when back online',
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
    code: {
      label: 'The six digits from the message',
      hint: 'It can take a minute to arrive.',
    },
    codeErrors: {
      REQUIRED: 'Enter the six digits from the message.',
      PATTERN_MISMATCH: 'Enter six digits, numbers only.',
    },
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
  myRecord: {
    title: 'My Record',
    heading: 'My Record',
    intro: 'Everything we hold about you, and everything you have put on the record.',
    signedOutHeading: 'Sign in to see your record',
    signedOutBody:
      'Your record is private to you. Sign in with the telephone number on your account to see what we hold about you and what you have submitted.',
    signedOutAction: 'Sign in to your account',
    loadingLabel: 'Loading your record',
    errorHeading: 'Your record could not be read',
    errorBody:
      'Nothing has changed. Try again in a moment. Your right to ask for your data is not affected while this screen is unavailable.',
    retry: 'Try again',
    accountHeading: 'Your account',
    accountIntro:
      'Your display name is the only part of you published. The fields below are held privately and shown to you alone.',
    identityStateLabel: 'Identity state',
    identityStates: {
      registered: 'Registered',
      checked: 'Checked',
    },
    wardLabel: 'Ward',
    wardUnresolved: 'Not confirmed yet',
    wardConfirm: 'Confirm your ward',
    memberSinceLabel: 'Member since',
    heldSummary: 'What is held about me',
    heldHint:
      'This is every field we hold for you. Nothing below is published except your display name.',
    fields: {
      displayName: 'Display name',
      fullName: 'Full name',
      telephoneNumber: 'Telephone number',
      declaredAge: 'Age you declared',
      language: 'Language',
      consents: 'Consents recorded',
      submissions: 'Submissions',
      backings: 'Proposals backed',
      requests: 'Data requests',
      heldItems: 'Items withheld from publication',
    },
    none: 'None',
    correction: {
      summary: 'Correct my details',
      hint: 'Your display name is the name shown on the record. Your full name and your language are held privately.',
      displayNameLabel: 'Display name',
      displayNameHint: 'Shown on everything you publish. Up to 60 characters.',
      fullNameLabel: 'Full name',
      fullNameHint: 'Held privately. Never published.',
      languageLabel: 'Language',
      save: 'Save changes',
      saving: 'Saving your changes',
      invalid: 'Check the highlighted fields and save again.',
      errors: {
        displayNameRequired: 'Enter the display name you want shown on the record.',
        displayNameLong: 'That display name is too long. Keep it under 60 characters.',
        displayNameTaken:
          'Another member already publishes that display name. Try a version with a number or an initial.',
        fullNameRequired: 'Enter your full name.',
        fullNameLong: 'That name is too long to hold. Keep it under 160 characters.',
        languageInvalid: 'Choose English or Yoruba.',
        rateLimited: 'Your display name changed recently. Try again later.',
        writeFailed:
          'Your details could not be saved. Nothing changed, and what you typed is still here.',
      },
    },
    language: {
      label: 'Language for this account',
      save: 'Save language',
      saved: 'Your language is saved.',
    },
    saved: {
      details: 'Your details are saved.',
      detailsRetained:
        'Your details are saved. Your earlier writing keeps the display name it was published under.',
    },
    consent: {
      summary: 'Consent records',
      hint: 'Each optional purpose is recorded on its own and changes as soon as you save it.',
      granted: 'Granted',
      withdrawn: 'Withdrawn',
      notAnswered: 'Not answered yet',
      recordedOn: 'Recorded {date}',
      withdrawnOn: 'Withdrawn {date}',
      toggleLabel: 'Allow {purpose}',
      save: 'Save consent',
      saving: 'Saving consent',
      changed: 'Your consent is saved and applies from now.',
      unchanged: 'That consent is already set that way. Nothing changed.',
      failed: 'Your consent could not be saved. Nothing changed; try again.',
      purposes: {
        decision_notices: {
          label: 'Decision notices',
          description: 'A message when the campaign answers one of your submissions.',
        },
        record_transfer: {
          label: 'Record transfer',
          description: 'Carrying your record into the next stage of the campaign.',
        },
        assisted_recording: {
          label: 'Assisted recording',
          description: 'A ward organiser may record a submission for you when you ask them to.',
        },
      },
    },
    submissions: {
      heading: 'Your submissions',
      emptyHeading: 'Nothing submitted yet',
      emptyBody:
        'When you raise something in your ward it appears here with the campaign\u2019s answer. A submission takes a few minutes, and it stays on the public record.',
      emptyAction: 'Raise something',
      open: 'Open submission {reference}',
      statuses: {
        awaiting_decision: 'Awaiting a decision',
        decided: 'Answered',
        withdrawn: 'Withdrawn by you',
        withheld: 'Withheld from publication',
        out_of_area: 'Outside the ward',
      },
      decisions: {
        commit: 'Commit',
        decline: 'Decline',
        refer: 'Refer',
      },
    },
    heldItems: {
      heading: 'Withheld from publication',
      body: 'These items you wrote are held back while a legal review finishes. The reason is the reviewer\u2019s published note.',
    },
    backings: {
      heading: 'Proposals you backed',
      empty: 'You have not backed a proposal yet.',
      states: {
        active: 'Active',
        withdrawn: 'Withdrawn',
        voided: 'Voided',
      },
    },
    requests: {
      heading: 'Your data requests',
      empty: 'You have not asked us for your data yet.',
      types: {
        access: 'Access',
        correction: 'Correction',
        export: 'Export',
        deletion: 'Deletion',
      },
      statuses: {
        received: 'Received',
        in_progress: 'In progress',
        completed: 'Completed',
        deferred_for_legal_hold: 'Deferred for a legal hold',
        refused: 'Refused',
      },
      requestedOn: 'Asked {date}',
      dueBy: 'Due by {date}',
      queued: 'Your request is recorded. We will work it within the published time.',
      download: 'Download your export',
      downloadNote:
        'The download link is short-lived. The file holds your account details, your consents, your submissions and your requests.',
      legalHoldHeading: 'Deferred for a legal hold',
      legalHoldBody:
        'One of your submissions is under legal review, so this request waits for it. Everything else in your account was handled.',
      legalHoldReason: 'Reason',
      legalHoldReview: 'The hold is reviewed on {date}',
      heldImmediately:
        'A submission of yours is under legal review, so this request waits for it. The hold is reviewed on {date}.',
      heldWithoutDate: 'A submission of yours is under legal review, so this request waits for it.',
    },
    exportAction: {
      summary: 'Download my data',
      body: 'We prepare a machine-readable file of everything held about you: your account details, your consents, your submissions and your requests. It is ready within thirty days, and asking again returns the same file.',
      submit: 'Request the file',
      submitted: 'Your export is requested. We will have the file ready within thirty days.',
      open: 'An export is already being prepared. It appears here when it is ready.',
      failed: 'The request could not be recorded. Nothing changed; try again.',
    },
    deleteAction: {
      summary: 'Delete my account',
      body: 'Deleting removes your full name, your telephone number and your age, and closes the account. Your submissions and comments stay on the public record, marked as withdrawn by you. A submission under legal review is kept until the review ends, and we tell you the date it is reviewed.',
      submit: 'Request deletion',
      submitted:
        'Your deletion is requested. Your direct identifiers are removed within thirty days.',
      failed: 'The request could not be recorded. Nothing changed; try again.',
      openHeading: 'Deletion in progress',
      openBody: 'A deletion request is open. We remove your direct identifiers within thirty days.',
    },
    signOut: 'Sign out',
    privacyLink: 'How we hold your data',
  },
  privacy: {
    title: 'Privacy notice',
    heading: 'Privacy notice',
    effective: 'In effect from {date}',
    updated: 'Updated {date}',
    updatedNote: 'This notice changed on {date}. The version it replaced is still readable below.',
    previousHeading: 'Earlier versions',
    previousLink: 'Version of {date}',
    viewingPrevious:
      'You are reading the version of {date}. The notice in effect from {effectiveDate} is the current one.',
    currentLink: 'Read the current notice',
    summaryHeading: 'What is public and what is held',
    summary:
      'What you submit is public. Your name and your telephone number are never published. Your data is never used for campaign contact, canvassing or persuasion, and no part of this platform can produce a list of members by ward.',
    lawfulHeading: 'Why we hold your data',
    lawfulBasis: [
      'Your account and your ward: held to run the account you asked for, and to place your submissions in the right ward.',
      'Your submissions and comments: published on the public record because you chose to raise them, under the account you created.',
      'Decision notices: sent only if you grant that consent, and withdrawn at once when you withdraw it.',
      'Record transfer: carried into the next stage of the campaign only if you grant that consent.',
      'Assisted recording: a ward organiser may record a submission for you only if you grant that consent.',
    ],
    rightsHeading: 'Your rights',
    rights: [
      'Access: see every field held about you, in plain language, on My Record.',
      'Correction: correct your display name, your full name and your language at any time.',
      'Export: ask for a machine-readable file of everything held about you.',
      'Deletion: ask for your account to be deleted. Your writing stays on the record, marked as withdrawn by you.',
      'Consent withdrawal: grant or withdraw each optional purpose from My Record, and the change applies at once.',
    ],
    retentionHeading: 'How long we keep it',
    retention: [
      'Pending registration: 24 hours, or until the code is accepted, then discarded.',
      'Account and profile: for the life of the account plus thirty days.',
      'Submissions, decisions and commitments: permanently, as the public record, with your author identity removed on request.',
      'Legal review records: kept with the item they concern, with the published note kept after the review.',
      'Moderation and access logs: twenty-four months.',
      'Analytics events: twenty-six months, then aggregated without identifiers.',
      'Backups: thirty-five days, then expired automatically.',
      'All of it is held in Nigeria.',
    ],
    processorsHeading: 'Who processes it, and where',
    processors: [
      {
        name: 'Model provider named in the processing agreement',
        purpose:
          'De-identified inference for ranking, routing and extraction. The payload carries no name, telephone number or member identifier.',
        region: 'Processing region named in the processing agreement',
      },
    ],
    contactHeading: 'Contact',
    contactBody:
      'Write to the privacy contact for any question about this notice, or about the data we hold about you. We answer within two working days.',
    contactLink: 'Write to the privacy contact',
    backToRecord: 'Back to the record home',
    errorHeading: 'This notice could not be loaded',
    errorBody:
      'The rest of the record is unaffected. Write to the privacy contact and we will send you the notice.',
    unknownVersion: 'That version of the notice has never been published.',
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
