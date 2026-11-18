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
  wait: {
    seconds: '{seconds} àáyá',
    oneSecond: 'àáyá kan',
    minutes: 'ìṣẹ́jú {minutes}',
    oneMinute: 'ìṣẹ́jú kan',
  },
};
