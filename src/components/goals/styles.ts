import { StyleSheet } from 'react-native';

import type { ProjectionSettings } from '@/domain/projection';
import { space } from '@/theme';

/** Saves Goals choices (with the values still being typed, see `Simulation`). */
export type SaveProjection = (patch: Partial<ProjectionSettings>) => void;

/** Text styles shared by the Goals cards. */
export const goalStyles = StyleSheet.create({
  cardTitle: { fontSize: 16, fontWeight: '600' },
  subTitle: { fontSize: 14, fontWeight: '600', marginTop: space.lg },
  hint: { fontSize: 12, marginTop: space.sm, lineHeight: 17 },
});
