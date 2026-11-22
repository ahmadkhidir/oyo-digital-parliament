/**
 * The yo-NG interface copy — the launch locale, not a later translation (`AGENTS.md` Stack:
 * Localisation). Key for key with `en-NG`; the type checker refuses a missing or extra key.
 *
 * The Yoruba copy in this catalogue was written to the same tone rules as the English: direct,
 * specific, no superlatives, no sentence assembly. It carries the sub-dotted vowels and tone
 * marks the brand typefaces were chosen for (`branding.md`, Typography). It is flagged for a
 * native-reader review pass before launch; the keys, the placeholders and the type shape are
 * the contract, and they are settled here.
 */
import type { Messages } from './en-NG';

export const yoNG: Messages = {
  brand: {
    name: 'Oyo Digital Parliament',
    tagline: 'Agbègbè rẹ, lórí ìwé ìṣirò.',
  },
  shell: {
    skipToContent: 'Fò sí apá àkọ́kọ́',
    mainLabel: 'Àpápọ̀',
  },
  footer: {
    disclosure:
      'Oyo Digital Parliament jẹ́ ọ̀nà ìpolongo ìṣèlú, kì í ṣe ìjọba. Ó gba ìpètú àwọn ará ìpínlẹ̀ mọ́ nínú ìwé ìṣirò ìjànbulú, ó sì ń fi hàn ní gbàngbán ohun tí ìpolongo náà dá wọn láyé.',
    navLabel: 'Ìwé ìṣirò',
    links: {
      commitments: 'Àkójọ àwọn ìlérí',
      ledger: 'Ìwé ìṣirò ìjànbulú',
      reportCard: 'Ìwé ìròyìn ìsẹ̀lì',
      myRecord: 'Ìṣirò mi',
      privacy: 'Àkíyèsí ìpamọ́',
      contact: 'Kàn sí wa',
    },
    languageLegend: 'Èdè',
    languageApply: 'Fi tó',
    languages: { 'en-NG': 'Gẹ̀ẹ́sì', 'yo-NG': 'Yorùbá' },
  },
  join: {
    title: 'Ìforúkọ́sílẹ̀',
    heading: 'Forukọ́sílẹ̀',
    publicationHeading: 'Ohun tí ó jáde ní gbàngbán',
    publicationBody:
      'Orúkọ ìfihàn rẹ ni ohun tí a fi hàn ní gbàngbán. Orúkọ ìlá rẹ, nọ́mbá fọ́òntù rẹ, àti ọjọ́ orí rẹ a fi pamọ́, a kì í fi hàn níbi ìwé ìṣirò.',
    eligibility:
      'Ìforúkọ́sílẹ̀ wà fún ará Ìpínlẹ̀ Ọ̀yọ́ ọmọ ọdún 18 dé 35. Ọjọ́ orí tí o ká sílẹ̀ ni a yẹ̀wò sí àgbéyàwò yìí, kò sì sí àkánnì tí a dá fún ẹnìkan tí ó kọjá rẹ̀.',
    privacyLink: 'Ka àkíyèsí ìpamọ́ kí o tó tẹ̀síwájú',
    pendingNotice:
      'Ìforúkọ́sílẹ̀ kan ti ń dúró lẹ́yìn kọ́dù rẹ tẹ́lẹ̀. Fọ́ọ̀mù yìí ń tọ́jú ohun tí o ti kọ.',
    errorSummaryHeading: 'Yẹ̀ wọ́ àwọn aṣàmúlẹ̀ yìí kí o tó fi ránṣẹ́',
    fields: {
      fullName: {
        label: 'Orúkọ ìlá rẹ',
        hint: 'A fi pamọ́. Kì í ṣe ohun tí a fi hàn níbi ìwé ìṣirò.',
        errors: {
          REQUIRED: 'Kọ orúkọ ìlá rẹ.',
          TOO_LONG: 'Orúkọ yìí gun jù. Má kọ ju 160 lẹ́tà lọ.',
        },
      },
      declaredAge: {
        label: 'Ọjọ́ orí rẹ',
        hint: 'Agbègbè ìgbà tí ìṣàjọ yìí kọ́: ọdún 18 dé 35.',
        errors: {
          REQUIRED: 'Kọ ọjọ́ orí rẹ.',
          OUT_OF_BAND: 'Ìforúkọ́sílẹ̀ wà fún ọmọ ọdún 18 dé 35. Kò sí àkánnì tí a dá.',
        },
      },
      telephoneNumber: {
        label: 'Nọ́mbá fọ́òntù rẹ',
        hint: 'Nọ́mbá tí kọ́dù ìmúlò yóò dé síbẹ̀. Nọ́mbá ará Nàìjíríà, àpẹẹrẹ +234 803 123 4567.',
        errors: {
          REQUIRED: 'Kọ nọ́mbá fọ́òntù tí kọ́dù yóò dé síbẹ̀.',
          PATTERN_MISMATCH:
            'Nọ́mbá yìí kì í ṣe nọ́mbá fọ́òntù ará Nàìjíríà tí a lè fi ránṣẹ́. Lo +234 lẹ́yìn díjítì mẹ́wàá.',
          ALREADY_SET: 'Nọ́mbá yìí ní àkánnì tẹ́lẹ̀. Kí o wọ inú rẹ nípa ìwọle.',
        },
      },
      displayName: {
        label: 'Orúkọ ìfihàn',
        optional: 'kò dandan',
        hint: 'Orúkọ kan ṣoṣo tí a fi hàn níbi ìwé ìṣirò. Fi ṣọ́nù kí a ó ṣe ọ̀kan fún ọ láti orúkọ ìlá rẹ.',
        errors: {
          TOO_LONG: 'Orúkọ ìfihàn yìí gun jù. Má ju 60 lẹ́tà lọ.',
        },
      },
    },
    displayNamePreviewTyped: 'Yóò hàn báyìí: {name}',
    displayNamePreviewBlank: 'Tí o fi ṣọ́nù, a ó ṣe orúkọ yìí fún ọ láti orúkọ ìlá rẹ.',
    sendCode: 'Fi kọ́dù náà ránṣẹ́',
    sending: 'Ó ń rán kọ́dù náà',
    pendingStatus: 'Ìforúkọ́sílẹ̀ kan ti wà láti bàrà rẹ yìí, ó ń dúró fún kọ́dù rẹ.',
    deliveryDelayedHeading: 'A kò lè fi kọ́dù náà ránṣẹ́',
    deliveryDelayedBody:
      'Ìforúkọ́sílẹ̀ rẹ dúró fún ọ̀jọ́ mẹ́rìnlélógún láti ìsìpẹ̀ yìí, kò sì sí àkánnì. Tẹ̀síwájú sí ojú-iṣẹ́ ìmúlò, ibẹ̀ ni o ti lè béèrè fún kọ́dù mìíràn.',
    deliveryDelayedContinue: 'Tẹ̀síwájú sí ìmúlò nọ́mbá rẹ',
    alreadyRegistered: 'Nọ́mbá yìí ní àkánnì tẹ́lẹ̀. Kí o wọ inú rẹ nípa ìwọle.',
    signIn: 'Ìwọle',
    rateLimited: 'Èyí pọ̀ jù. Dùrò {duration}, lẹ́yìn náà tún gbìyànjú.',
    degraded:
      'Ìṣẹ́ kò lè gbà ìforúkọ́sílẹ̀ yìí ní ìsìpẹ̀ yìí. Kò sí ohun tí a dá, àwọn ọ̀rọ̀ tí o kọ sì wà níbẹ̀. Gbìyànjú lẹ́kọ̀ọ́.',
    expiredRegistration: 'Ìforúkọ́sílẹ̀ yẹn ti kọjá ìgbà rẹ̀. Bẹ̀rẹ̀ lẹ́kọ̀ọ́ ní ìsàlẹ̀ pẹ̀lú kọ́dù tuntun.',
    offline: 'O wà ní ìtannà. Fọ́ọ̀mù náà dúró; yóò rán lẹ́yìn tí ìbáraẹnisọ̀rọ̀ bá padà.',
    offlineSubmit: 'Fi rán nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
  },
  confirm: {
    title: 'Ìmúlò nọ́mbá rẹ',
    heading: 'Mú nọ́mbá rẹ múlẹ̀',
    numberIntro: 'A fi kọ́dù díjítì mẹ́fà ránṣẹ́ sí {number}.',
    numberIntroHeld:
      'A kò lè fi kọ́dù àkọ́kọ́ ránṣẹ́ sí {number}. Ìforúkọ́sílẹ̀ rẹ dúró fún ọ̀jọ́ mẹ́rìnlélógún; béèrè fún kọ́dù ní ìsàlẹ̀.',
    codeLabel: 'Àwọn díjítì mẹ́fà láti inú ìfiránṣẹ́ náà',
    codeHint: 'Ó lè gba ìṣẹ́jú kan kí ó dé.',
    codeErrors: {
      REQUIRED: 'Kọ àwọn díjítì mẹ́fà láti inú ìfiránṣẹ́ náà.',
      PATTERN_MISMATCH: 'Kọ díjítì mẹ́fà, nọ́mbá pẹ̀lúpẹ̀lú.',
    },
    confirm: 'Mú kọ́dù náà múlẹ̀',
    confirming: 'Ó ń yẹ̀ wọ́ kọ́dù náà',
    resend: 'Fi kọ́dù tuntun ránṣẹ́',
    resending: 'Ó ń rán kọ́dù tuntun',
    resendCountdown: 'O lè béèrè fún kọ́dù tuntun lẹ́yìn {duration}.',
    resendReady: 'O lè béèrè fún kọ́dù tuntun báyìí.',
    resendStaticNote: 'O lè béèrè fún kọ́dù tuntun lẹ́yìn ìṣẹ́jú kan.',
    deliveryNote:
      'Ìfiránṣẹ́ lè gba ìṣẹ́jú kan. Tí kò bá dé, béèrè fún kọ́dù mìíràn ní ìsàlẹ̀ — ìforúkọ́sílẹ̀ rẹ dúró títí tí ìgbà ọ̀jọ́ mẹ́rìnlélógún yóò fi pàrí.',
    changeNumber: 'Nọ́mbá yìí kì í ṣe tìré',
    incorrectTwo: 'Kọ́dù yìí kì í ṣe òótọ́. Ìgbìyànjú {attempts} ṣoṣo nìyìí fún ọ.',
    incorrectOne: 'Kọ́dù yìí kì í ṣe òótọ́. Ìgbìyànjú kan ṣoṣo nìyìí fún ọ.',
    attemptsExhausted: 'Ìgbìyànjú ti tán. Dùrò {duration}, lẹ́yìn náà kọ kọ́dù tuntun.',
    expired: 'Kọ́dù yìí ti kọjá ìgbà rẹ̀. Béèrè fún tuntun ní ìsàlẹ̀.',
    expiredRegistration: 'Ìforúkọ́sílẹ̀ yìí ti kọjá ìgbà rẹ̀. Padà sí fọ́ọ̀mù ìforúkọ́sílẹ̀.',
    alreadyUsed: 'Kọ́dù yìí ti dá àkánnì tẹ́lẹ̀. Kí o wọ inú rẹ nípa ìwọle.',
    resendFailed:
      'A kò lè fi ìfiránṣẹ́ náà ránṣẹ́ ní ìsìpẹ̀ yìí. Ìforúkọ́sílẹ̀ rẹ wà láàárín ọwọ́; gbìyànjú lẹ́kọ̀ọ́ díẹ̀.',
    resendRateLimited: 'A fi kọ́dù tuntun ránṣẹ́ ṣẹ́ṣẹ́. Béèrè fún mìíràn lẹ́yìn {duration}.',
    resendCapReached: 'Kọ́dù tí ó pọ̀ jù ti dé sí nọ́mbá yìí. Gbìyànjú lẹ́kọ̀ọ́ lẹ́yìn {duration}.',
    resendSent: 'Kọ́dù tuntun ń bọ lọ́nà sí {number}.',
    offline: 'O wà ní ìtannà. Ìforúkọ́sílẹ̀ rẹ dúró; mú u múlẹ̀ nígbà tí ìbáraẹnisọ̀rọ̀ bá padà.',
    offlineSubmit: 'Mú u múlẹ̀ nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
    resendOffline: 'Fi rán nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
    degraded: 'Ìṣẹ́ kò lè fésè ní ìsìpẹ̀ yìí. Kò sí ohun tí ó yí; gbìyànjú lẹ́kọ̀ọ́.',
    signIn: 'Ìwọle',
    backToForm: 'Padà sí fọ́ọ̀mù ìforúkọ́sílẹ̀',
  },
  ward: {
    title: 'Agbègbè rẹ',
    heading: 'Agbègbè wo ni o ń gbé?',
    intro:
      'Ṣàpèjúwe agbègbè rẹ bí ìwọ yóò ṣe sọ ọ́. A máa ń dábà àwọn orúkọ ward; ìwọ ni yóò yan èyí tí ó bá a mu.',
    areaLabel: 'Ìjọba ìbílẹ̀',
    areaHint:
      'Yan ìjọba ìbílẹ̀ kí o tó yan ward. Ó máa ń dín àkójọ kù, ó sì ń ya àwọn ward tí ó ní orúkọ kan náà já.',
    areaPlaceholder: 'Yan ìjọba ìbílẹ̀ kan',
    descriptionLabel: 'Ṣàpèjúwe agbègbè rẹ',
    descriptionHint:
      'Àmì ilẹ̀ kan, pópó kan tàbí orúkọ tí ìwọ ń lò fún agbègbè náà. Ọ̀rọ̀ rẹ fúnra rẹ̀ ti tó.',
    descriptionPlaceholder: 'Àpẹẹrẹ: lẹ́yìn ọjà Agbowo, nítòsí ọ̀nà express',
    suggesting: 'Ó ń wá ward rẹ',
    candidatesLegend: 'Àwọn ward tí a dábà',
    candidateOption: '{name} — {area}',
    noCandidates:
      'Kò sí ward nínú àkójọ tí ó bá àwọn ọ̀rọ̀ yìí mu. A ṣì gba agbègbè rẹ; fi ránṣẹ́ fún àyẹ̀wò ní ìsàlẹ̀.',
    candidateError:
      'A kò lè ka àkójọ ward ní ìsìpẹ̀ yìí. Ọ̀rọ̀ rẹ ṣì tó; fi ránṣẹ́ fún àyẹ̀wò ní ìsàlẹ̀.',
    areaRequired: 'Ward ju ọ̀kan lọ ní orúkọ yẹn. Yan ìjọba ìbílẹ̀ rẹ lókè kí a lè dábà èyí tí ó tọ́.',
    confirm: 'Mú ward náà múlẹ̀',
    confirming: 'Ó ń kọ ward rẹ sílẹ̀',
    noneOfThese: 'Kò sí ọ̀kan nínú èyí',
    noneOfTheseHint:
      'Yan èyí tí kò bá sí àbá tí ó jẹ́ agbègbè rẹ. Olùyẹ̀wò yóò mú u múlẹ̀, ìwọ sì lè tẹ̀síwájú.',
    unresolvedHeading: 'Tí agbègbè rẹ kò bá sí nínú àkójọ',
    unresolvedNote:
      'A ṣì gbà á. Yóò wà ní àìdánilójú títí olùyẹ̀wò yóò fi mú u múlẹ̀, àkánnì rẹ sì ń ṣiṣẹ́.',
    recordedHeading: 'A ti kọ ward rẹ sílẹ̀',
    recordedBody: 'Ìṣirò rẹ wà nínú {ward}. O lè yí i padà ní ìsàlẹ̀ tí kò bá tọ́.',
    sentHeading: 'A ti fi agbègbè ránṣẹ́ fún ìmúlò',
    sentBody:
      'A ó yẹ̀wò agbègbè rẹ, a ó sì mú u múlẹ̀. O lè tẹ̀síwájú báyìí; kò sí ohun tí ó dídúró nígbà tí kò tíì múlẹ̀.',
    sentContinue: 'Tẹ̀síwájú sí ìwé ìṣirò',
    errors: {
      descriptionRequired: 'Ṣàpèjúwe agbègbè rẹ kí o tó fi ránṣẹ́.',
      descriptionLong: 'Àpèjúwe yìí gun jù. Má ju 500 lẹ́tà lọ.',
      areaLong: 'Orúkọ ìjọba ìbílẹ̀ yìí gun jù.',
      choiceRequired: 'Yan ward tí a dábà, tàbí yan Kò sí ọ̀kan nínú èyí.',
      wardUnknown: 'Ward yẹn kò sí nínú àkójọ mọ́. Yan àbá mìíràn, tàbí fi ọ̀rọ̀ rẹ ránṣẹ́ fún àyẹ̀wò.',
      writeFailed:
        'A kò lè kọ ward náà sílẹ̀ ní ìsìpẹ̀ yìí. Kò sí ohun tí ó yí, ọ̀rọ̀ rẹ sì ṣì wà. Gbìyànjú lẹ́kọ̀ọ́.',
      idempotencyRequired: 'Fọ́ọ̀mù náà ti pẹ́ kí ó tó fi ránṣẹ́. Yẹ̀ wọ́ ọ̀rọ̀ rẹ kí o tún gbìyànjú.',
      idempotencyConflict: 'A ti fi fọ́ọ̀mù yìí ránṣẹ́ pẹ̀lú ọ̀rọ̀ mìíràn. Yẹ̀ wọ́ wọn kí o tún gbìyànjú.',
    },
    offline: 'O wà ní ìtannà. Àwọn ọ̀rọ̀ rẹ dúró; fọ́ọ̀mù yóò rán nígbà tí ìbáraẹnisọ̀rọ̀ bá padà.',
    offlineSubmit: 'Fi rán nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
  },
  signIn: {
    title: 'Ìwọle',
    heading: 'Ìwọle',
    intro: 'Kọ nọ́mbá fónì tí ó wà lórí àkánnì rẹ. A fi kọ́dù díjítì mẹ́fà ránṣẹ́ sí i.',
    sessionEnded: 'Ìgbà ìwọle rẹ ti parí. Wọ inú lẹ́kọ̀ọ́ kí o lè tẹ̀síwájú.',
    telephoneNumber: {
      label: 'Nọ́mbá fónì',
      hint: 'Nọ́mbá tí àkánnì rẹ ń lò. Nọ́mbá Nàìjíríà, àpẹẹrẹ +234 803 123 4567.',
      errors: {
        REQUIRED: 'Kọ nọ́mbá fónì tí ó wà lórí àkánnì rẹ.',
        PATTERN_MISMATCH:
          'Èyí kì í ṣe nọ́mbá fónì alágbáyé Nàìjíríà tí a lè fi ránṣẹ́. Lo +234 lẹ́yìn náà kọ díjítì mẹ́wàá.',
      },
    },
    sendCode: 'Fi kọ́dù ránṣẹ́',
    sending: 'Ó ń rán kọ́dù',
    codeIntro: 'A fi kọ́dù díjítì mẹ́fà ránṣẹ́ sí {number}.',
    code: {
      label: 'Àwọn díjítì mẹ́fà láti inú ìfiránṣẹ́ náà',
      hint: 'Ó lè gba ìṣẹ́jú kan kí ó dé.',
    },
    codeErrors: {
      REQUIRED: 'Kọ àwọn díjítì mẹ́fà láti inú ìfiránṣẹ́ náà.',
      PATTERN_MISMATCH: 'Kọ díjítì mẹ́fà, nọ́mbá pẹ̀lúpẹ̀lú.',
    },
    confirm: 'Wọ inú',
    confirming: 'Ó ń wọ inú',
    incorrectTwo: 'Kọ́dù yìí kì í ṣe òótọ́. Ìgbìyànjú {attempts} ṣoṣo nìyìí fún ọ.',
    incorrectOne: 'Kọ́dù yìí kì í ṣe òótọ́. Ìgbìyànjú kan ṣoṣo nìyìí fún ọ.',
    attemptsExhausted: 'Ìgbìyànjú ti tán. Dùrò {duration}, lẹ́yìn náà kọ kọ́dù tuntun.',
    codeExpired: 'Kọ́dù yìí ti kọjá ìgbà rẹ̀. Fi mìíràn ránṣẹ́ ní ìsàlẹ̀.',
    codeAlreadyUsed: 'Kọ́dù yìí ti lo tẹ́lẹ̀. Fi mìíràn ránṣẹ́ ní ìsàlẹ̀.',
    sendFailed: 'A kò lè fi kọ́dù náà ránṣẹ́ ní ìsìpẹ̀ yìí. Gbìyànjú lẹ́kọ̀ọ́ díẹ̀.',
    rateLimited: 'Èyí pọ̀ jù. Dùrò {duration}, lẹ́yìn náà tún gbìyànjú.',
    degraded: 'Ìṣẹ́ kò lè fésè ní ìsìpẹ̀ yìí. Kò sí ohun tí ó yí; gbìyànjú lẹ́kọ̀ọ́.',
    deliveryNote: 'Ìfiránṣẹ́ lè gba ìṣẹ́jú kan. Tí kò bá dé, fi kọ́dù mìíràn ránṣẹ́ ní ìsàlẹ̀.',
    resend: 'Fi kọ́dù tuntun ránṣẹ́',
    resending: 'Ó ń rán kọ́dù tuntun',
    resendCountdown: 'O lè béèrè fún kọ́dù tuntun lẹ́yìn {duration}.',
    resendReady: 'O lè béèrè fún kọ́dù tuntun báyìí.',
    resendStaticNote: 'O lè béèrè fún kọ́dù tuntun lẹ́yìn ìṣẹ́jú kan.',
    useDifferentNumber: 'Lo nọ́mbá mìíràn',
    createAccountPrompt: 'Kò sí àkánnì lórí nọ́mbá yìí?',
    createAccount: 'Dá ọ̀kan dá.',
    offline: 'O wà ní ìtannà. Fọ́ọ̀mù náà dúró; yóò rán lẹ́yìn tí ìbáraẹnisọ̀rọ̀ bá padà.',
    offlineSend: 'Fi rán nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
    offlineConfirm: 'Wọ inú nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
    offlineResend: 'Fi rán nígbà tí ìbáraẹnisọ̀rọ̀ bá padà',
  },
  myRecord: {
    title: 'Ìṣirò mi',
    heading: 'Ìṣirò mi',
    intro: 'Gbogbo ohun tí a ni nípa rẹ, àti gbogbo ohun tí o ti fi sínú ìwé ìṣirò.',
    signedOutHeading: 'Wọlé láti wo ìṣirò rẹ',
    signedOutBody:
      'Ìṣirò rẹ jẹ́ ohun ìkọ̀kọ̀ fún ọ. Wọlé pẹ̀lú nọ́mbá fọ́òntù tó wà lórí àkánnì rẹ láti wo ohun tí a ni nípa rẹ àti ohun tí o ti fi ránṣẹ́.',
    signedOutAction: 'Wọlé sínú àkánnì rẹ',
    loadingLabel: 'Ó ń gbé ìṣirò rẹ wá',
    errorHeading: 'A kò lè ka ìṣirò rẹ',
    errorBody:
      'Kò sí ohun tó yí padà. Gbìyànjú lẹ́ẹ̀kan sí i. Ẹ̀tọ́ rẹ láti béèrè fún dátà rẹ kò ní lọ nígbà tí ojú-ìwé yìí kò bá ṣiṣẹ́.',
    retry: 'Gbìyànjú lẹ́ẹ̀kan sí i',
    accountHeading: 'Àkánnì rẹ',
    accountIntro:
      'Orúkọ ìfihàn rẹ nìkan ni a fi hàn ní gbàngbán. Àwọn ààyè tó wà nísàlẹ̀ ni a fi pamọ́, ìwọ nìkan sì lè wò wọ́n.',
    identityStateLabel: 'Ipò ìdánimọ̀',
    identityStates: {
      registered: 'Ti forúkọsílẹ̀',
      checked: 'Ti yẹ̀wò',
    },
    wardLabel: 'Agbègbè',
    wardUnresolved: 'A kò tíì fi dá',
    wardConfirm: 'Fi agbègbè rẹ dá',
    memberSinceLabel: 'Ọmọ ẹgbẹ́ láti',
    heldSummary: 'Ohun tí a ni nípa mi',
    heldHint:
      'Eyí ni gbogbo ààyè tí a ni fún ọ. Kò sí ohun tó wà nísàlẹ̀ tí a fi hàn ní gbàngbán àyàfí orúkọ ìfihàn rẹ.',
    fields: {
      displayName: 'Orúkọ ìfihàn',
      fullName: 'Orúkọ ìlá',
      telephoneNumber: 'Nọ́mbá fọ́òntù',
      declaredAge: 'Ọjọ́ orí tí o ká',
      language: 'Èdè',
      consents: 'Ìfọwọ́sí tí a kọ',
      submissions: 'Ìpètú',
      backings: 'Àbá tí o ti ṣe àtìlẹ́yìn',
      requests: 'Ìbéèrè dátà',
      heldItems: 'Ohun tí a dá dúró kúrò ní gbàngbán',
    },
    none: 'Kò sí',
    correction: {
      summary: 'Tún àwọn àlàyé mi ṣe',
      hint: 'Orúkọ ìfihàn rẹ ni orúkọ tí a fi hàn nínú ìwé ìṣirò. Orúkọ ìlá rẹ àti èdè rẹ ni a fi pamọ́.',
      displayNameLabel: 'Orúkọ ìfihàn',
      displayNameHint: 'A fi í hàn lórí gbogbo ohun tí o fi jáde. Ó gbà dé ohun kíkọ 60.',
      fullNameLabel: 'Orúkọ ìlá',
      fullNameHint: 'A fi pamọ́. A kì í fi í hàn ní gbàngbán.',
      languageLabel: 'Èdè',
      save: 'Fi àwọn àyípadà pamọ́',
      saving: 'Ó ń pa àwọn àyípadà rẹ mọ́',
      invalid: 'Yẹ̀wò àwọn ààyè tí a sàmì sí, kí o sì tún fi pamọ́.',
      errors: {
        displayNameRequired: 'Kọ orúkọ ìfihàn tí o fẹ́ kí a fi hàn nínú ìwé ìṣirò.',
        displayNameLong: 'Orúkọ ìfihàn yẹn gùn jù. Ó gbà dé ohun kíkọ 60.',
        displayNameTaken:
          'Ọmọ ẹgbẹ́ mìíràn ti ń fi orúkọ ìfihàn yẹn hàn. Gbìyànjú pẹ̀lú nọ́mbá tàbí lẹ́tà àkọ́kọ́.',
        fullNameRequired: 'Kọ orúkọ ìlá rẹ.',
        fullNameLong: 'Orúkọ yẹn gùn jù láti pa mọ́. Ó gbà dé ohun kíkọ 160.',
        languageInvalid: 'Yan Gẹ̀ẹ́sì tàbí Yorùbá.',
        rateLimited: 'Orúkọ ìfihàn rẹ yí padà láìpẹ́. Gbìyànjú nígbà mìíràn.',
        writeFailed: 'A kò lè pa àwọn àlàyé rẹ mọ́. Kò sí ohun tó yí padà, ohun tí o kọ sì ṣì wà.',
      },
    },
    language: {
      label: 'Èdè fún àkánnì yìí',
      save: 'Fi èdè pamọ́',
      saved: 'A ti pa èdè rẹ mọ́.',
    },
    saved: {
      details: 'A ti pa àwọn àlàyé rẹ mọ́.',
      detailsRetained:
        'A ti pa àwọn àlàyé rẹ mọ́. Ohun tí o kọ tẹ́lẹ̀ ń pa orúkọ ìfihàn tí a fi í hàn mọ́.',
    },
    consent: {
      summary: 'Àwọn ìfọwọ́sí',
      hint: 'A kọ ìdí kọ̀ọ̀kan sílẹ̀ lọ́tọ̀, ó sì yí padà ní kété tí o bá fi pamọ́.',
      granted: 'Ti gbà',
      withdrawn: 'Ti yọ',
      notAnswered: 'A kò tíì dá',
      recordedOn: 'A kọ ní {date}',
      withdrawnOn: 'A yọ ní {date}',
      toggleLabel: 'Gba ààyè fún {purpose}',
      save: 'Fi ìfọwọ́sí pamọ́',
      saving: 'Ó ń pa ìfọwọ́sí mọ́',
      changed: 'A ti pa ìfọwọ́sí rẹ mọ́, ó sì ń ṣiṣẹ́ láti báyìí.',
      unchanged: 'Ìfọwọ́sí yẹn ti wà bẹ́ẹ̀. Kò sí ohun tó yí padà.',
      failed: 'A kò lè pa ìfọwọ́sí rẹ mọ́. Kò sí ohun tó yí padà; gbìyànjú lẹ́ẹ̀kan sí i.',
      purposes: {
        decision_notices: {
          label: 'Ìwífún ìpinnu',
          description: 'Ìfiránṣẹ́ nígbà tí ìpolongo bá dá ìpètú rẹ láhùn.',
        },
        record_transfer: {
          label: 'Gbígbé ìṣirò',
          description: 'Gbígbé ìṣirò rẹ lọ sí ìpele tó ń bọ̀ nínú ìpolongo.',
        },
        assisted_recording: {
          label: 'Ìkọlẹ̀sílẹ̀ pẹ̀lú ìrànwọ́',
          description: 'Olùṣètò agbègbè lè kọ ìpètú fún ọ nígbà tí o bá ní kí ó ṣe bẹ́ẹ̀.',
        },
      },
    },
    submissions: {
      heading: 'Àwọn ìpètú rẹ',
      emptyHeading: 'A kò tíì fi ohun kankan ránṣẹ́',
      emptyBody:
        'Nígbà tí o bá gbé ohun kan kalẹ̀ ní agbègbè rẹ, yóò hàn níbí pẹ̀lú ìdáhùn ìpolongo. Ìpètú ń gba ìṣẹ́jú díẹ̀, ó sì dúró nínú ìwé ìṣirò ìjànbulú.',
      emptyAction: 'Gbe ohun kan kalẹ̀',
      open: 'Ṣí ìpètú {reference}',
      statuses: {
        awaiting_decision: 'Ó ń dúró ìpinnu',
        decided: 'A ti dáhùn',
        withdrawn: 'Ìwọ ló yọ ọ́',
        withheld: 'A dá a dúró kúrò ní gbàngbán',
        out_of_area: 'Ó wà ní agbègbè mìíràn',
      },
      decisions: {
        commit: 'Ìlérí',
        decline: 'Kíkọ̀',
        refer: 'Ìtọ́kasi',
      },
    },
    heldItems: {
      heading: 'A dá dúró kúrò ní gbàngbán',
      body: 'Àwọn ohun tí o kọ wọ̀nyí dúró nígbà tí àyẹ̀wò òfin ń parí. Ìdí ni àkọsílẹ̀ tí olùyẹ̀wò fi hàn.',
    },
    backings: {
      heading: 'Àwọn àbá tí o ṣe àtìlẹ́yìn',
      empty: 'O kò tíì ṣe àtìlẹ́yìn àbá kankan.',
      states: {
        active: 'Ń ṣiṣẹ́',
        withdrawn: 'Ti yọ',
        voided: 'Ti di asán',
      },
    },
    requests: {
      heading: 'Àwọn ìbéèrè dátà rẹ',
      empty: 'O kò tíì béèrè fún dátà rẹ.',
      types: {
        access: 'Ìwọlé',
        correction: 'Àtúnṣe',
        export: 'Ìjáde',
        deletion: 'Píparẹ́',
      },
      statuses: {
        received: 'A gbà',
        in_progress: 'Ń lọ lọ́wọ́',
        completed: 'A parí',
        deferred_for_legal_hold: 'A dúró fún àtiwò òfin',
        refused: 'A kọ̀',
      },
      requestedOn: 'A béèrè ní {date}',
      dueBy: 'Yóò parí ní {date}',
      queued: 'A ti kọ ìbéèrè rẹ sílẹ̀. A ó ṣe é láàárín àkókò tí a tẹ̀ jáde.',
      download: 'Gba ìjáde rẹ',
      downloadNote:
        'Ìjápọ̀ ìgbà díẹ̀ ni. Fáìlì náà ní àwọn àlàyé àkánnì rẹ, ìfọwọ́sí rẹ, àwọn ìpètú rẹ àti àwọn ìbéèrè rẹ.',
      legalHoldHeading: 'A dúró fún àtiwò òfin',
      legalHoldBody:
        'Ọ̀kan nínú àwọn ìpètú rẹ wà lábẹ́ àyẹ̀wò òfin, torí náà ìbéèrè yìí ń dúró dè é. A ti ṣe àwọn ohun mìíràn ní àkánnì rẹ.',
      legalHoldReason: 'Ìdí',
      legalHoldReview: 'A ó yẹ̀wò àtiwò náà ní {date}',
      heldImmediately:
        'Ìpètú kan tìrẹ wà lábẹ́ àyẹ̀wò òfin, torí náà ìbéèrè yìí ń dúró dè é. A ó yẹ̀wò àtiwò náà ní {date}.',
      heldWithoutDate: 'Ìpètú kan tìrẹ wà lábẹ́ àyẹ̀wò òfin, torí náà ìbéèrè yìí ń dúró dè é.',
    },
    exportAction: {
      summary: 'Gba dátà mi',
      body: 'A ń pèsè fáìlì ẹ̀rọ kan tí ó ní gbogbo ohun tí a ni nípa rẹ: àwọn àlàyé àkánnì rẹ, ìfọwọ́sí rẹ, àwọn ìpètú rẹ àti àwọn ìbéèrè rẹ. Yóò ṣetán láàárín ọgbọ̀n ọjọ́, bí o bá sì tún béèrè, fáìlì kan náà ni.',
      submit: 'Béèrè fún fáìlì náà',
      submitted: 'A ti béèrè ìjáde rẹ. Fáìlì náà yóò ṣetán láàárín ọgbọ̀n ọjọ́.',
      open: 'A ti ń pèsè ìjáde kan. Yóò hàn níbí nígbà tí ó bá ṣetán.',
      failed: 'A kò lè kọ ìbéèrè náà sílẹ̀. Kò sí ohun tó yí padà; gbìyànjú lẹ́ẹ̀kan sí i.',
    },
    deleteAction: {
      summary: 'Pa àkánnì mi rẹ́',
      body: 'Píparẹ́ ń yọ orúkọ ìlá rẹ, nọ́mbá fọ́òntù rẹ àti ọjọ́ orí rẹ kúrò, ó sì pa àkánnì náà. Àwọn ìpètú àti àwíjàre rẹ yóò dúró nínú ìwé ìṣirò ìjànbulú, a ó sì sàmì sí wọn pé ìwọ ló yọ wọ́n. Ìpètú tó wà lábẹ́ àyẹ̀wò òfin ni a ó pa mọ́ títí àyẹ̀wò yóò fi parí, a ó sì sọ ọjọ́ tí a ó yẹ̀wò rẹ̀ fún ọ.',
      submit: 'Béèrè pípàrẹ́',
      submitted: 'A ti béèrè pípàrẹ́ rẹ. A ó yọ àwọn ìdánimọ̀ tààrà rẹ kúrò láàárín ọgbọ̀n ọjọ́.',
      failed: 'A kò lè kọ ìbéèrè náà sílẹ̀. Kò sí ohun tó yí padà; gbìyànjú lẹ́ẹ̀kan sí i.',
      openHeading: 'Pípàrẹ́ ń lọ lọ́wọ́',
      openBody: 'Ìbéèrè pípàrẹ́ kan ṣì wà. A ó yọ àwọn ìdánimọ̀ tààrà rẹ kúrò láàárín ọgbọ̀n ọjọ́.',
    },
    signOut: 'Jáde',
    privacyLink: 'Bí a ṣe ń tọ́jú dátà rẹ',
  },
  privacy: {
    title: 'Àkíyèsí ìpamọ́',
    heading: 'Àkíyèsí ìpamọ́',
    effective: 'Ó ń ṣiṣẹ́ láti {date}',
    updated: 'A ṣe àtúnṣe ní {date}',
    updatedNote: 'Àkíyèsí yìí yí padà ní {date}. Ẹ̀yà tí ó rọ́pò rẹ̀ ṣì lè kà nísàlẹ̀.',
    previousHeading: 'Àwọn ẹ̀yà tẹ́lẹ̀',
    previousLink: 'Ẹ̀yà ti {date}',
    viewingPrevious: 'O ń ka ẹ̀yà ti {date}. Àkíyèsí tó ń ṣiṣẹ́ láti {effectiveDate} ni ẹ̀yà tuntun.',
    currentLink: 'Ka àkíyèsí tuntun',
    summaryHeading: 'Ohun tí ó jáde àti ohun tí a fi pamọ́',
    summary:
      'Ohun tí o fi ránṣẹ́ jáde ní gbàngbán. A kì í fi orúkọ rẹ àti nọ́mbá fọ́òntù rẹ hàn. A kì í lo dátà rẹ fún ìkànsí ìpolongo, pípolongo tàbí yíyí èrò; kò sì sí apá kankan nínú ẹ̀rọ yìí tó lè ṣe àkójọ àwọn ọmọ ẹgbẹ́ nípasẹ̀ agbègbè.',
    lawfulHeading: 'Ìdí tí a fi ń tọ́jú dátà rẹ',
    lawfulBasis: [
      'Àkánnì rẹ àti agbègbè rẹ: a ń tọ́jú wọn láti ṣètò àkánnì tí o béèrè, àti láti fi àwọn ìpètú rẹ sí agbègbè tó yẹ.',
      'Àwọn ìpètú àti àwíjàre rẹ: a ń tẹ̀ wọ́n jáde nínú ìwé ìṣirò ìjànbulú nítorí pé ìwọ ló yàn láti gbé wọn kalẹ̀, lábẹ́ àkánnì tí o dá.',
      'Ìwífún ìpinnu: a ń rán wọn nígbà tí o bá gba ààyè náà, a sì dá wọn dúró ní kété tí o bá yọ ààyè náà.',
      'Gbígbé ìṣirò: a ń gbé ìṣirò rẹ lọ sí ìpele tó ń bọ̀ nínú ìpolongo nígbà tí o bá gba ààyè náà.',
      'Ìkọlẹ̀sílẹ̀ pẹ̀lú ìrànwọ́: olùṣètò agbègbè lè kọ ìpètú fún ọ nígbà tí o bá gba ààyè náà.',
    ],
    rightsHeading: 'Àwọn ẹ̀tọ́ rẹ',
    rights: [
      'Ìwọlé: wo gbogbo ààyè tí a ni nípa rẹ, ní èdè tó yé, lórí Ìṣirò mi.',
      'Àtúnṣe: tún orúkọ ìfihàn rẹ, orúkọ ìlá rẹ àti èdè rẹ ṣe nígbàkigbà.',
      'Ìjáde: béèrè fún fáìlì ẹ̀rọ kan tí ó ní gbogbo ohun tí a ni nípa rẹ.',
      'Pípàrẹ́: béèrè kí a pa àkánnì rẹ. Ohun tí o kọ yóò dúró nínú ìwé ìṣirò, a ó sì sàmì sí i pé ìwọ ló yọ ọ́.',
      'Yíyọ ìfọwọ́sí: gba tàbí yọ ìdí kọ̀ọ̀kan lórí Ìṣirò mi, àyípadà náà sì ń ṣiṣẹ́ lẹ́sẹ̀kẹsẹ̀.',
    ],
    retentionHeading: 'Bí a ṣe ń pa á mọ́ pẹ́ tó',
    retention: [
      'Ìforúkọsílẹ̀ tó ń dúró: wákàtí 24, tàbí títí a ó fi gba kọ́dù náà, lẹ́yìn náà a ó dànù.',
      'Àkánnì àti àlàyé rẹ: fún ìgbésí ayé àkánnì náà pẹ̀lú ọgbọ̀n ọjọ́ mìíràn.',
      'Àwọn ìpètú, ìpinnu àti ìlérí: títí ayé, gẹ́gẹ́ bí ìwé ìṣirò ìjànbulú, a ó sì yọ ìdánimọ̀ olùkọ rẹ kúrò nígbà tí o bá béèrè.',
      'Àkọsílẹ̀ àyẹ̀wò òfin: a ń tọ́jú wọn pẹ̀lú ohun tí wọ́n kàn, àkọsílẹ̀ tí a tẹ̀ jáde sì dúró lẹ́yìn àyẹ̀wò náà.',
      'Àkọsílẹ̀ àtúnṣe àti àkọsílẹ̀ ìwọlé: oṣù 24.',
      'Ìṣẹ̀lẹ̀ ìtúpalẹ̀: oṣù 26, lẹ́yìn náà a ó kójọ wọn láìsí ìdánimọ̀.',
      'Àwọn àfọwọ́kọ ìdáàbòbò: ọjọ́ 35, lẹ́yìn náà wọ́n máa ń parí fúnra wọn.',
      'Gbogbo wọn wà ní Nàìjíríà.',
    ],
    processorsHeading: 'Ẹni tó ń ṣe àtúnṣe rẹ̀, àti ibi tí ó ti ṣe é',
    processors: [
      {
        name: 'Olùpèsè ẹ̀rọ ìtúpalẹ̀ tí a dárúkọ nínú àdéhùn ìṣiṣẹ́',
        purpose:
          'Ìtúpalẹ̀ tí a yọ ìdánimọ̀ kúrò fún ìtòlẹ́sẹẹsẹ, ìtọ́kasi àti ìyọjáde. Ohun tí a rán lọ kò ní orúkọ, nọ́mbá fọ́òntù tàbí ìdánimọ̀ ọmọ ẹgbẹ́.',
        region: 'Agbègbè ìṣiṣẹ́ tí a dárúkọ nínú àdéhùn ìṣiṣẹ́',
      },
    ],
    contactHeading: 'Kàn sí wa',
    contactBody:
      'Kọ̀wé sí olùbójú ìpamọ́ fún ìbéèrè kankan nípa àkíyèsí yìí, tàbí nípa dátà tí a ni nípa rẹ. A ń dáhùn láàárín ọjọ́ iṣẹ́ méjì.',
    contactLink: 'Kọ̀wé sí olùbójú ìpamọ́',
    backToRecord: 'Padà sí ilé ìwé ìṣirò',
    errorHeading: 'A kò lè gbé àkíyèsí yìí wá',
    errorBody:
      'Ìyókù ìwé ìṣirò kò ní ìfarapa. Kọ̀wé sí olùbójú ìpamọ́, a ó sì rán àkíyèsí náà fún ọ.',
    unknownVersion: 'A kò tíì tẹ ẹ̀yà àkíyèsí yẹn jáde rí.',
  },
  wait: {
    seconds: '{seconds} àáyá',
    oneSecond: 'àáyá kan',
    minutes: 'ìṣẹ́jú {minutes}',
    oneMinute: 'ìṣẹ́jú kan',
  },
};
