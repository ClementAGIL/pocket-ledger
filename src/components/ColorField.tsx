import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ColorPicker, { HueSlider, InputWidget, Panel1, Preview } from 'reanimated-color-picker';

import { tooSimilar } from '@/domain/colors';
import { radius, space, useTheme } from '@/theme';

import { Button, ModalCard } from './ui';

/** Quick picks: the validated chart palette (distinct for colour-blind readers too) + neutral gray. */
export const PRESET_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948', '#85847f'];

/**
 * Color choice for a category: preset swatches, or any color with the "Custom" picker
 * (saturation/brightness panel, hue slider, hex input). Warns when the color is hard to tell
 * apart from another category's, since they sit side by side in charts and lists.
 */
export function ColorField({
  value,
  onChange,
  others,
}: {
  value: string;
  onChange: (color: string) => void;
  /** Other categories, to warn about look-alike colors. */
  others: { name: string; color: string }[];
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const isCustom = !PRESET_COLORS.some((c) => c.toLowerCase() === value.toLowerCase());
  const lookAlike = tooSimilar(value, others);
  const draftLookAlike = tooSimilar(draft, others);

  const openPicker = () => {
    setDraft(value);
    setOpen(true);
  };

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.swatches}>
        {PRESET_COLORS.map((c) => {
          const selected = c.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={c}
              onPress={() => onChange(c)}
              accessibilityRole="button"
              accessibilityLabel={`Color ${c}`}
              accessibilityState={{ selected }}
              style={[styles.swatch, { backgroundColor: c, borderColor: selected ? theme.text : 'transparent' }]}
            />
          );
        })}
        <Pressable
          onPress={openPicker}
          accessibilityRole="button"
          accessibilityLabel="Custom color"
          accessibilityState={{ selected: isCustom }}
          style={[
            styles.swatch,
            styles.custom,
            { backgroundColor: isCustom ? value : theme.surfaceAlt, borderColor: isCustom ? theme.text : theme.border },
          ]}>
          {!isCustom && <Ionicons name="color-palette-outline" size={16} color={theme.text} />}
        </Pressable>
      </View>
      {lookAlike && (
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          ⚠ Hard to tell apart from {lookAlike.name} in charts.
        </Text>
      )}

      {/* ModalCard brings its own gesture root: Android modals render outside the app's, the picker needs one. */}
      <ModalCard visible={open} onClose={() => setOpen(false)} style={{ maxWidth: 420 }}>
        <Text style={[styles.title, { color: theme.text }]}>Custom color</Text>
        <ColorPicker value={draft} onCompleteJS={({ hex }) => setDraft(hex.slice(0, 7))} style={{ gap: space.md }}>
          <Preview hideInitialColor style={styles.preview} />
          <Panel1 style={styles.panel} />
          <HueSlider style={styles.slider} />
          <InputWidget
            formats={['HEX']}
            defaultFormat="HEX"
            disableAlphaChannel
            inputStyle={{ color: theme.text, borderColor: theme.border }}
            inputTitleStyle={{ color: theme.textSecondary }}
            iconColor={theme.textSecondary}
          />
        </ColorPicker>
        {draftLookAlike && (
          <Text style={{ color: theme.textSecondary, fontSize: 13 }}>⚠ Hard to tell apart from {draftLookAlike.name} in charts.</Text>
        )}
        <View style={styles.buttons}>
          <Button
            title="Use this color"
            onPress={() => {
              onChange(draft);
              setOpen(false);
            }}
            style={{ flex: 1 }}
          />
          <Button title="Cancel" variant="secondary" onPress={() => setOpen(false)} style={{ flex: 1 }} />
        </View>
      </ModalCard>
    </View>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 3 },
  custom: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  preview: { height: 36, borderRadius: radius.sm },
  panel: { height: 180, borderRadius: radius.md },
  slider: { height: 28, borderRadius: 14 },
  buttons: { flexDirection: 'row', gap: space.sm },
});
