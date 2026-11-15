import { View } from 'react-native';
import { Text } from '@/components/text';

import { Button, Card, Empty, Screen, text } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { useLibrary } from '@/lib/library';

/** Delivery addresses kept on this phone (offered at checkout). */
export default function AddressesScreen() {
  const { t } = useI18n();
  const library = useLibrary();
  return (
    <Screen>
      {library.addresses.length === 0 ? (
        <Empty icon="location-outline" text={t.addresses.empty} />
      ) : null}
      {library.addresses.map((address) => (
        <Card
          key={`${address.destinationId}-${address.contact.phone}-${address.contact.addressLine}`}
        >
          <View>
            <Text style={text.heading}>{address.contact.recipientName}</Text>
            <Text style={text.body}>{address.contact.addressLine}</Text>
            <Text style={text.muted}>
              {address.contact.city} · {address.destinationLabel}
            </Text>
            <Text style={text.muted}>{address.contact.phone}</Text>
          </View>
          <Button
            label={t.common.remove}
            variant="secondary"
            onPress={() => library.forgetAddress(address)}
          />
        </Card>
      ))}
    </Screen>
  );
}
