/**
 * features/settings/screens/TermsAndConditionsScreen.tsx — the Terms page.
 *
 * Purpose:      Publish the agreement a player accepts by using the app.
 * Responsibilities:
 *               - Render the terms through the shared legal-document frame.
 * Notes:        Written to match what the app actually does. In particular there
 *               is no clause about purchases, because this build has no in-app
 *               purchase; a terms page promising a refund policy for a product
 *               that cannot be bought is the kind of detail a store review reads
 *               as a lie.
 */

import { APP_VERSION } from '@config';
import { APP_NAME } from '@shared/branding';

import { LegalDocumentScreen, type LegalDocument } from './LegalDocumentScreen';

const TERMS_AND_CONDITIONS: LegalDocument = {
  title: 'Terms & Conditions',
  effectiveDate: '1 March 2026',
  sections: [
    {
      heading: 'Accepting these terms',
      paragraphs: [
        `By installing or playing ${APP_NAME} you agree to these terms. If you do not agree with them, please uninstall the app and stop using it.`,
        `These terms describe version ${APP_VERSION} of the app.`,
      ],
    },
    {
      heading: 'Your licence',
      paragraphs: [
        `${APP_NAME} is licensed, not sold, to you for your own personal, non-commercial use. You may play it on any device you own and you may share it with family, but you may not sell it, redistribute it, reverse-engineer it, or use it to build a competing product.`,
        'All artwork, sound, level designs, text and code in the app are owned by the publisher and protected by copyright. The names of third-party services used by the app remain the property of their respective owners.',
      ],
    },
    {
      heading: 'Acceptable use',
      paragraphs: [
        'Do not attempt to break the app, tamper with its scoring, or automate play in a way that gains you an advantage over other players. Do not upload or transmit content that is unlawful, offensive, or infringes anyone’s rights.',
        'Weekly league tables are ranked from scores submitted by players. We may remove a score that we believe was obtained unfairly, and we may remove a player who repeatedly abuses the service.',
      ],
    },
    {
      heading: 'The game is provided as is',
      paragraphs: [
        `${APP_NAME} is provided "as is" and "as available", without warranty of any kind, express or implied. We do not warrant that the app will be uninterrupted, error-free, or free of defects, or that it will meet any particular purpose.`,
        'To the fullest extent permitted by law, we are not liable for any indirect, incidental, special or consequential damages arising from your use of the app, including loss of progress data. Nothing in these terms excludes liability that cannot lawfully be excluded.',
      ],
    },
    {
      heading: 'Your progress data',
      paragraphs: [
        'Progress stored on your device belongs to you. If you sign in, your progress is also stored on our servers so it can follow you to a new device. You can delete that data and your account from the Account screen at any time.',
        'We may change, suspend, or discontinue any part of the app, including the weekly league and the daily challenge. Where a change removes a feature you have paid for, we will refund you; this build contains no paid features.',
      ],
    },
    {
      heading: 'Advertising',
      paragraphs: [
        'The app shows third-party advertisements. We do not control the content of those advertisements and are not responsible for it. Advertisements are shown to all players on equal terms; this build has no paid ad-removal option.',
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: [
        'We may update these terms. The effective date at the top always reflects the current version, and material changes are noted in the release notes. Continuing to play after a change means you accept the updated terms.',
      ],
    },
  ],
};

/**
 * The Terms & Conditions page.
 *
 * Exported as a component rather than as document data because the router route
 * wants a component, and because a route should never be handed raw text to
 * render — that is how a document ends up unstyled in one place and styled in
 * another.
 */
export function TermsAndConditionsScreen() {
  return <LegalDocumentScreen document={TERMS_AND_CONDITIONS} />;
}