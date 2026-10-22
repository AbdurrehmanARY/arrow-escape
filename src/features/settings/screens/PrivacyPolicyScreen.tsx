/**
 * features/settings/screens/PrivacyPolicyScreen.tsx — the Privacy Policy page.
 *
 * Purpose:      Publish, inside the app, an honest account of what the app stores
 *               and who it shares it with.
 * Responsibilities:
 *               - Render the policy through the shared legal-document frame.
 * Notes:        The wording below mirrors the published privacy policy document
 *               that ships alongside the app; this file is the single source the
 *               in-app screen draws from. The two must be updated together: an
 *               out-of-date privacy policy is worse than none, because players
 *               rely on it. If a future build adds a data partner, the matching
 *               section has to be added here AND in the published document in the
 *               same change. This build uses AdMob for ads and optional Google
 *               sign-in backed by Supabase; there is no analytics SDK and never
 *               has been.
 */

import { APP_VERSION } from '@config';
import { APP_NAME } from '@shared/branding';

import { LegalDocumentScreen, type LegalDocument } from './LegalDocumentScreen';

const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  effectiveDate: '20 October 2026',
  sections: [
    {
      heading: 'Who We Are',
      paragraphs: [
        `This Privacy Policy describes how information is collected when you use the ${APP_NAME} mobile game application.`,
        'Developer: Abdur Rehman',
        'Contact Email: aryousaf4@gmail.com',
      ],
    },
    {
      heading: 'Information We Collect',
      paragraphs: [
        'Information you provide:',
        'Email address and profile information (when you sign in with Google)',
        'Display name (from your Google profile)',
        'Game preferences and settings you configure',
        'Information collected automatically:',
        'Gameplay progress and achievement data (saved locally and optionally synced to server)',
        'Device information (device model, OS version, app version, IP address when syncing)',
        'Game usage statistics (play frequency, level completion, streaks)',
        'Advertising identifier (AAID/GAID) for ad personalization',
      ],
    },
    {
      heading: 'How We Use Information',
      paragraphs: [
        'To save and sync your game progress across devices (when you sign in)',
        'To provide personalized experiences and track achievements',
        'To show relevant advertisements through AdMob',
        'To analyze game usage and improve the app',
        'To communicate with you about updates or important notices',
      ],
    },
    {
      heading: 'Third-Party Services',
      paragraphs: [
        'We use the following third-party services:',
        'AdMob (Google): Mobile advertising network. Used for: displaying advertisements in the game. Shares: advertising identifiers, device information, and usage data. Ads shown: rewarded video ads (for earning hints) and interstitial ads (level completion). Non-personalized ads are requested for all ad requests, and child-directed treatment is applied for users under 13. Privacy Policy: https://policies.google.com/privacy',
        'Google Play Services: App distribution, sign-in, and crash reporting. Used for: Google Sign-In, app installation, updates, and crash reporting. Shares: profile information (when signing in) and device information. Privacy Policy: https://policies.google.com/privacy',
        'Supabase: Backend services for data synchronization. Used for: storing and syncing user progress and achievements. Shares: user game data, authentication information, and device information (only when signed in). Privacy Policy: https://supabase.com/docs/guides/legal/privacy-policy',
        'Expo / EAS Build: Application build and deployment. Used for: building and distributing the app. Privacy Policy: https://docs.expo.dev/privacy-policy/',
      ],
    },
    {
      heading: 'Advertising and Device Identifiers',
      paragraphs: [
        'This app uses advertising to support development. We use Google AdMob which:',
        'Collects and uses advertising identifiers (AAID/GAID) when permitted by your device settings',
        'Shows non-personalized ads by default (no interest-based targeting)',
        'Provides an opt-out option for interest-based ads via device settings',
        'You can limit ad tracking or reset your advertising identifier in your device settings: Android → Settings → Google → Ads → Opt out of Ads Personalization.',
        'Note: Rewarded video ads are only shown when you choose to watch them to earn hints.',
      ],
    },
    {
      heading: 'Children\'s Privacy',
      paragraphs: [
        'COPPA Notice: This app is designed for users of all ages, including children under 13.',
        'For children under 13:',
        'Google Sign-In requires parental consent via Family Link',
        'Cloud sync is disabled for accounts without parental verification',
        'AdMob processes ads with child-directed treatment enabled',
        'No personal information is collected from children without parental consent',
        'If you are a parent and believe your child has provided us with personal information, please contact us at aryousaf4@gmail.com so we can promptly delete such information.',
      ],
    },
    {
      heading: 'Data Sharing, Retention, and Security',
      paragraphs: [
        'Data Sharing: We do not sell, rent, or share your personal information with third parties for their marketing purposes. We only share data with the third-party services listed above to provide app functionality.',
        'Data Retention:',
        'Local game progress: retained until you delete the app or reset progress',
        'Cloud-synced data: retained for 24 months after last activity, then deleted',
        'Account data: retained until account deletion (via email request)',
        'Anonymous usage statistics: not collected or transmitted',
        'Data Security: We implement reasonable security measures to protect your information, including encrypted transmission (HTTPS/TLS) and secure storage where applicable. Session tokens are stored in the device\'s secure keystore.',
      ],
    },
    {
      heading: 'User Rights and Data Deletion',
      paragraphs: [
        'You have the right to:',
        'Access, correct, or delete your personal information',
        'Opt out of personalized advertising',
        'Request deletion of your cloud-synced data',
        'To request deletion of your data, email your request to aryousaf4@gmail.com. Include the email address associated with your account if applicable. We will delete your data within a reasonable time (typically 30 days).',
        'Account Deactivation: You can also delete your account in-app through the Account screen, which triggers deletion via our Supabase backend.',
      ],
    },
    {
      heading: 'Changes to This Privacy Policy',
      paragraphs: [
        'We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last updated" date. We encourage you to review this policy periodically.',
        'We may notify you of material changes via email (if you have an account) or through an in-app notice.',
        `This policy describes version ${APP_VERSION} of the app.`,
      ],
    },
    {
      heading: 'Contact Us',
      paragraphs: [
        'If you have any questions about this Privacy Policy or your data, please contact us:',
        'Email: aryousaf4@gmail.com',
        'For children\'s privacy inquiries, please identify yourself as a parent in your email.',
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