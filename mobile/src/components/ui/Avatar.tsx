import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, RADIUS, FONT } from '../../constants/theme';
import { IcCheck } from './Icons';

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  onPress?: () => void;
  showBorder?: boolean;
  verified?: boolean;
  /** Shows an unseen-story ring around the avatar, with a gap between avatar and ring. */
  hasStory?: boolean;
}

export function Avatar({ uri, name, size = 40, onPress, showBorder, verified, hasStory }: AvatarProps) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  const fontSize = size * 0.38;
  const ringSize = size + 8;

  const inner = (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }, showBorder && styles.border]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.image, { borderRadius: size / 2 }]} />
      ) : (
        <View style={[styles.fallback, { borderRadius: size / 2 }]}>
          <Text style={[styles.initial, { fontSize }]}>{initial}</Text>
        </View>
      )}
      {verified && (
        <View style={styles.verifiedBadge}>
          <IcCheck size={8} color={COLORS.white} strokeWidth={3} />
        </View>
      )}
    </View>
  );

  const content = hasStory ? (
    <View style={[styles.storyRing, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}>
      {inner}
    </View>
  ) : inner;

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: {
    overflow: 'visible',
  },
  border: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  storyRing: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: COLORS.primary,
    fontWeight: FONT.weight.bold,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  verifiedIcon: {
    color: COLORS.white,
    fontSize: 8,
    fontWeight: FONT.weight.bold,
  },
});
