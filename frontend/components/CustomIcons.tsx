import React from 'react';
import { View, StyleSheet } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
};

// 人のアイコン（シンプルなシルエット、アウトラインスタイル）
export function PersonIcon({ size = 40, color = '#37352f' }: IconProps) {
  const scale = size / 40; // ベースサイズを40に変更
  const containerSize = size;
  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]}>
      {/* 頭（円、アウトライン） */}
      <View
        style={[
          styles.personHead,
          {
            width: 14 * scale,
            height: 14 * scale,
            borderRadius: 7 * scale,
            borderWidth: 2 * scale,
            borderColor: color,
            backgroundColor: 'transparent',
            top: (containerSize - 14 * scale - 14 * scale) / 2 - 1 * scale, // 中央揃え
          },
        ]}
      />
      {/* 体（台形、アウトライン） */}
      <View
        style={[
          styles.personBody,
          {
            width: 18 * scale,
            height: 14 * scale,
            borderWidth: 2 * scale,
            borderColor: color,
            backgroundColor: 'transparent',
            top: (containerSize - 14 * scale - 14 * scale) / 2 + 13 * scale, // 頭の下に配置
            borderTopLeftRadius: 4 * scale,
            borderTopRightRadius: 4 * scale,
            borderBottomLeftRadius: 2 * scale,
            borderBottomRightRadius: 2 * scale,
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

// 通知ベルのアイコン（アウトラインスタイル）
export function NotificationIcon({ size = 40, color = '#37352f' }: IconProps) {
  const scale = size / 40; // ベースサイズを40に変更
  const containerSize = size;
  const bellHeight = 4 * scale + 18 * scale + 5 * scale; // ハンドル + 本体 + 鈴
  const topOffset = (containerSize - bellHeight) / 2; // 中央揃えのためのオフセット
  return (
    <View style={[styles.container, { width: containerSize, height: containerSize }]}>
      {/* ベルのハンドル（上部の小さな長方形、アウトライン） */}
      <View
        style={[
          styles.bellHandle,
          {
            width: 8 * scale,
            height: 4 * scale,
            borderWidth: 2 * scale,
            borderColor: color,
            backgroundColor: 'transparent',
            top: topOffset,
            borderRadius: 2 * scale,
          },
        ]}
      />
      {/* ベルの本体（上部が広く、下部が狭い、アウトライン） */}
      <View
        style={[
          styles.bellBody,
          {
            width: 20 * scale,
            height: 18 * scale,
            borderWidth: 2 * scale,
            borderColor: color,
            backgroundColor: 'transparent',
            top: topOffset + 4 * scale,
            borderTopLeftRadius: 10 * scale,
            borderTopRightRadius: 10 * scale,
            borderBottomLeftRadius: 3 * scale,
            borderBottomRightRadius: 3 * scale,
          },
        ]}
      />
      {/* ベルの割れ目（中央の縦線、白い背景で見えるように） */}
      <View
        style={[
          styles.bellCrack,
          {
            width: 2.5 * scale,
            height: 14 * scale,
            backgroundColor: '#ffffff',
            top: topOffset + 6 * scale,
            borderRadius: 1.25 * scale,
          },
        ]}
      />
      {/* ベルの鈴（下部中央の小さな円、アウトライン） */}
      <View
        style={[
          styles.bellClapper,
          {
            width: 5 * scale,
            height: 5 * scale,
            borderRadius: 2.5 * scale,
            borderWidth: 2 * scale,
            borderColor: color,
            backgroundColor: 'transparent',
            top: topOffset + 20 * scale,
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
  bellCrack: {
    position: 'absolute',
    alignSelf: 'center',
  },
  bellClapper: {
    position: 'absolute',
    alignSelf: 'center',
  },
});

