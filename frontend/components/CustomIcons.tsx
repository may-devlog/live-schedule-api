import React from 'react';
import { View, StyleSheet } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
};

// 人のアイコン（シンプルなシルエット）
export function PersonIcon({ size = 24, color = '#37352f' }: IconProps) {
  const scale = size / 24;
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* 頭（円） */}
      <View
        style={[
          styles.personHead,
          {
            width: 8 * scale,
            height: 8 * scale,
            borderRadius: 4 * scale,
            backgroundColor: color,
            top: 2 * scale,
          },
        ]}
      />
      {/* 体（台形） */}
      <View
        style={[
          styles.personBody,
          {
            width: 12 * scale,
            height: 10 * scale,
            backgroundColor: color,
            top: 10 * scale,
            borderTopLeftRadius: 2 * scale,
            borderTopRightRadius: 2 * scale,
          },
        ]}
      />
    </View>
  );
}

// 鍵のアイコン
export function LockIcon({ size = 24, color = '#37352f' }: IconProps) {
  const scale = size / 24;
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* 鍵の頭（円） */}
      <View
        style={[
          styles.lockHead,
          {
            width: 10 * scale,
            height: 10 * scale,
            borderRadius: 5 * scale,
            borderWidth: 2 * scale,
            borderColor: color,
            top: 2 * scale,
          },
        ]}
      />
      {/* 鍵の本体（長方形） */}
      <View
        style={[
          styles.lockBody,
          {
            width: 8 * scale,
            height: 10 * scale,
            backgroundColor: color,
            top: 12 * scale,
            borderRadius: 1 * scale,
          },
        ]}
      />
    </View>
  );
}

// 通知ベルのアイコン
export function NotificationIcon({ size = 24, color = '#37352f' }: IconProps) {
  const scale = size / 24;
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* ベルのハンドル（上部の小さな長方形） */}
      <View
        style={[
          styles.bellHandle,
          {
            width: 4 * scale,
            height: 2 * scale,
            backgroundColor: color,
            top: 0,
            borderRadius: 1 * scale,
          },
        ]}
      />
      {/* ベルの本体（上部が広い台形） */}
      <View
        style={[
          styles.bellBody,
          {
            width: 14 * scale,
            height: 12 * scale,
            backgroundColor: color,
            top: 2 * scale,
            borderTopLeftRadius: 2 * scale,
            borderTopRightRadius: 2 * scale,
            borderBottomLeftRadius: 7 * scale,
            borderBottomRightRadius: 7 * scale,
          },
        ]}
      />
      {/* ベルの鈴（小さな円） */}
      <View
        style={[
          styles.bellClapper,
          {
            width: 2 * scale,
            height: 2 * scale,
            borderRadius: 1 * scale,
            backgroundColor: color,
            top: 14 * scale,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  personHead: {
    position: 'absolute',
    alignSelf: 'center',
  },
  personBody: {
    position: 'absolute',
    alignSelf: 'center',
  },
  lockHead: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'transparent',
  },
  lockBody: {
    position: 'absolute',
    alignSelf: 'center',
  },
  bellHandle: {
    position: 'absolute',
    alignSelf: 'center',
  },
  bellBody: {
    position: 'absolute',
    alignSelf: 'center',
  },
  bellClapper: {
    position: 'absolute',
    alignSelf: 'center',
  },
});

