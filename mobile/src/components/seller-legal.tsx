import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/lib/theme';
import type { CatalogSeller } from '@/lib/types';

type Legal = NonNullable<CatalogSeller['legal']>;

/** A seller's legal identity (law 18-05); collapsible when shown inside an order. */
export function SellerLegal({
  legal,
  note,
  collapsible = false,
}: {
  readonly legal: Legal;
  readonly note: string;
  readonly collapsible?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!collapsible);
  return (
    <View style={styles.legal}>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={styles.toggle}
        >
          <Text style={[text.muted, styles.underline]}>{t.register.legalTitle}</Text>
        </Pressable>
      ) : (
        <Text style={text.heading}>{t.register.legalTitle}</Text>
      )}
      {open ? (
        <>
          <Text style={text.body}>{legal.legalName}</Text>
          <Text style={text.muted}>
            {t.register[`kind${legal.registerKind}`]} : {legal.registerNumber}
          </Text>
          <Text style={text.muted}>NIF : {legal.taxId}</Text>
          <Text style={text.muted}>{legal.address}</Text>
          <Text style={text.muted}>
            {legal.phone} · {legal.email}
          </Text>
          <Text style={text.muted}>{note}</Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  legal: { gap: 2, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  toggle: { minHeight: 44, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
});
