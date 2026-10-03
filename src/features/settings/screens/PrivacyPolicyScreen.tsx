/**
 * features/settings/screens/PrivacyPolicyScreen.tsx — the Privacy Policy page.
 *
 * Purpose:      Publish, inside the app, an honest account of what the app stores
 *               and who it shares it with.
 * Responsibilities:
 *               - Render the policy through the shared legal-document frame.
 * Notes:        **Every claim below was read out of the code, not invented.** The
 *               app has no analytics SDK and no crash reporter, so there is no
 *               analytics section; it does use AdMob, so there is an advertising
 *               one. If a future build adds a data partner, the corresponding
 *               section has to be added here in the same change — an out-of-date
 *               privacy policy is worse than none, because it is relied upon.
 */

import { APP_VERSION } from '@config';
import { APP_NAME } from '@shared/branding';

import { LegalDocumentScreen, type LegalDocument } from './LegalDocumentScreen';

const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  effectiveDate: '1 March 2026',
  sections: [
    {
      heading: 'The short version',
      paragraphs: [
        `${APP_NAME} is a puzzle game. Most of what it knows about you never leaves your phone: your progress, your settings, your hints and your streak are stored on the device only, unless you choose to sign in with Google, in which case that same progress is also backed up to your account so it can follow you to a new phone.`,
        'We do not sell your personal information, and we do not use it for advertising.',
      ],
    },
    {
      heading: 'What is stored on your device',
      paragraphs: [
        'The following is written to local storage on your phone and is not transmitted anywhere: your level progress and personal bests, your settings for sound, haptics and theme, your remaining hints, whether you have seen the tutorial, your daily challenge results, your weekly league score, and your current streak.',
        'If you sign out, or uninstall the app, this data is removed. Signing in and then signing out does not delete your cloud backup — see "Removing your data" below.',
      ],
    },
    {
      heading: 'What happens if you sign in with Google',
      paragraphs: [
        'Signing in is optional and the game is fully playable without it. If you choose to sign in, the app sends your Google ID token to our server, and Google tells us your email address and display name. We store your user identifier, that name, and your progress: the levels you have cleared, the challenge days you have won, and your weekly league score.',
        'This exists so that clearing a level on one device means the level is already cleared on the next one, and so that your name appears on the weekly leaderboard. If you would rather not be listed, you can play without signing in and your device-only progress is never published to anyone.',
        'Your sign-in session is held in the operating system’s secure keystore, not in ordinary app storage.',
      ],
    },
    {
      heading: 'Advertising',
      paragraphs: [
        'The game shows advertisements supplied by Google AdMob. Rewarded advertisements are offered in exchange for a hint, which you choose to watch — nothing is taken automatically. Short interstitial advertisements may appear between levels.',
        'Google and its partners may use the device advertising identifier and your approximate location to serve and measure these ads. This is done under Google’s own policies, and you can reset or delete the identifier in your device settings.',
        'This build has no mechanism to remove ads by purchase, so every player sees the same ads.',
      ],
    },
    {
      heading: 'What we do not do',
      paragraphs: [
        'There is no analytics or tracking SDK in this app. There is no crash reporter, no advertising identifier read by us, and no third-party profile of you assembled anywhere. We do not build a profile for advertising and we do not share your information with data brokers.',
      ],
    },
    {
      heading: 'Children',
      paragraphs: [
        'The game is suitable for all ages, but it is not directed at children under 13, and we do not knowingly collect personal information from them. Because a Google account used for sign-in is an adult account, a younger player is better off playing without signing in.',
      ],
    },
    {
      heading: 'Your choices',
      paragraphs: [
        'You can play entirely offline of us, with no account and nothing transmitted. You can sign out at any time from the Account screen. You can delete your cloud data — and your account with it — from the same screen, which removes your progress from our servers permanently.',
      ],
    },
    {
      heading: 'Changes to this policy',
      paragraphs: [
        'If a future version of the app changes what is stored or who receives it, this page changes with it, and the effective date at the top changes too. Material changes are noted in the release notes for that version.',
        `This policy describes version ${APP_VERSION} of the app.`,
      ],
    },
  ],
};

/**
 * The Privacy Policy page.
 *
 * Exported as a component rather than as document data because the router route
 * wants a component, and because a route should never be handed raw text to
 * render — that is how a document ends up unstyled in one place and styled in
 * another.
 */
export function PrivacyPolicyScreen() {
  return <LegalDocumentScreen document={PRIVACY_POLICY} />;
}