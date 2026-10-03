/**
 * features/settings/screens/LegalDocumentScreen.tsx — the frame both legal
 * documents are drawn in.
 *
 * Purpose:      One screen that renders a titled, versioned, scrollable block of
 *               legal text, so Privacy Policy and Terms & Conditions are the same
 *               page with different words rather than two hand-rolled screens.
 * Responsibilities:
 *               - Render a header (with a working back action) and the document.
 *               - Render a document from data, not from JSX, so the two documents
 *                 cannot drift apart in how they look.
 * Notes:        **The text is data, not markup, on purpose.** A legal document is
 *               something that gets edited, reviewed and re-published; keeping it as
 *               a plain array of `{ heading, paragraphs }` means a wording change is
 *               a data edit, and it cannot accidentally introduce a stray `<View>`
 *               that the layout then has to accommodate.
 *
 *               Nothing here fetches or stores anything — a privacy policy that
 *               itself needed a network request would be a poor advertisement for
 *               the claim it makes.
 */

import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, useTheme } from '@components';
import { fonts, radius, spacing, typography } from '@theme';

/** One block of a legal document: an optional heading and its paragraphs. */
export interface LegalSection {
  /** Omitted for a continuation block that belongs to the section above it. */
  readonly heading?: string;
  readonly paragraphs: readonly string[];
}

export interface LegalDocument {
  readonly title: string;
  /** Shown under the title and repeated at the foot, so a screenshot is attributable. */
  readonly effectiveDate: string;
  readonly sections: readonly LegalSection[];
}

export interface LegalDocumentScreenProps {
  document: LegalDocument;
}

export function LegalDocumentScreen({ document }: LegalDocumentScreenProps) {
  const router = useRouter();
  const { palette } = useTheme();

  return (
    <Screen palette={palette} scroll>
      <View style={styles.container}>
        <ScreenHeader
          palette={palette}
          title={document.title}
          subtitle={`Effective ${document.effectiveDate}`}
          onBack={() => router.back()}
          backLabel="Back to settings"
        />

        <View style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {document.sections.map((section, index) => (
            <View key={section.heading ?? `section-${index}`} style={styles.section}>
              {section.heading ? (
                <Text style={[styles.heading, { color: palette.text }]}>{section.heading}</Text>
              ) : null}
              {section.paragraphs.map((paragraph, pIndex) => (
                <Text
                  key={`${index}-${pIndex}`}
                  style={[styles.paragraph, { color: palette.textMuted }]}
                >
                  {paragraph}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: spacing.xl,
  },
  sheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  heading: {
    ...typography.heading,
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  paragraph: {
    ...typography.body,
    fontSize: 14,
    lineHeight: 22,
  },
});