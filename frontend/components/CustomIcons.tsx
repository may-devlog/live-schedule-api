import React from 'react';
import { View, StyleSheet } from 'react-native';

type IconProps = {
  size?: number;
  color?: string;
};

type StrokeProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
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

function Line({
  length,
  color,
  thickness,
  rotateDeg = 0,
}: {
  length: number;
  color: string;
  thickness: number;
  rotateDeg?: number;
}) {
  return (
    <View
      style={{
        width: length,
        height: thickness,
        backgroundColor: color,
        borderRadius: thickness / 2,
        transform: [{ rotate: `${rotateDeg}deg` }],
      }}
    />
  );
}

export function CloseIcon({ size = 22, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const thickness = strokeWidth;
  const length = size * 0.85;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute' }}>
        <Line length={length} color={color} thickness={thickness} rotateDeg={45} />
      </View>
      <View style={{ position: 'absolute' }}>
        <Line length={length} color={color} thickness={thickness} rotateDeg={-45} />
      </View>
    </View>
  );
}

export function HomeOutlineIcon({ size = 16, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 16;
  const w = size;
  const h = size;
  const t = strokeWidth * scale;
  const bodyW = 11 * scale;
  const bodyH = 8.5 * scale;
  const roofW = 10 * scale;
  const roofH = 10 * scale;
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          top: 1.5 * scale,
          width: roofW,
          height: roofH,
          borderLeftWidth: t,
          borderTopWidth: t,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          backgroundColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 1 * scale,
          width: bodyW,
          height: bodyH,
          borderWidth: t,
          borderColor: color,
          borderRadius: 2 * scale,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

export function ArrowLeftIcon({ size = 16, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 16;
  const t = strokeWidth * scale;
  const lineLen = 10 * scale;
  const headSize = 6 * scale;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 3 * scale, alignSelf: 'center' }}>
        <Line length={lineLen} color={color} thickness={t} rotateDeg={0} />
      </View>
      <View
        style={{
          position: 'absolute',
          left: 3 * scale,
          width: headSize,
          height: headSize,
          borderLeftWidth: t,
          borderBottomWidth: t,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

export function EyeIcon({ size = 20, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 20;
  const t = strokeWidth * scale;
  const w = 18 * scale;
  const h = 11 * scale;
  const pupil = 3.5 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderWidth: t,
          borderColor: color,
          borderRadius: h / 2,
          backgroundColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: pupil,
          height: pupil,
          borderRadius: pupil / 2,
          borderWidth: t,
          borderColor: color,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

export function EyeOffIcon({ size = 20, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 20;
  const t = strokeWidth * scale;
  const slashLen = size * 0.95;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <EyeIcon size={size} color={color} strokeWidth={strokeWidth} />
      <View style={{ position: 'absolute' }}>
        <Line length={slashLen} color={color} thickness={t} rotateDeg={-35} />
      </View>
    </View>
  );
}

export function MailIcon({ size = 18, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 18;
  const t = strokeWidth * scale;
  const w = 18 * scale;
  const h = 12 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: w,
          height: h,
          borderWidth: t,
          borderColor: color,
          borderRadius: 2 * scale,
          backgroundColor: 'transparent',
          overflow: 'hidden',
        }}
      />
      <View style={{ position: 'absolute', top: (size - h) / 2 + 1 * scale }}>
        <Line length={w * 0.62} color={color} thickness={t} rotateDeg={25} />
      </View>
      <View style={{ position: 'absolute', top: (size - h) / 2 + 1 * scale }}>
        <Line length={w * 0.62} color={color} thickness={t} rotateDeg={-25} />
      </View>
    </View>
  );
}

export function HashIcon({ size = 18, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 18;
  const t = strokeWidth * scale;
  const len = 14 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', left: 6 * scale }}>
        <Line length={len} color={color} thickness={t} rotateDeg={90} />
      </View>
      <View style={{ position: 'absolute', left: 11 * scale }}>
        <Line length={len} color={color} thickness={t} rotateDeg={90} />
      </View>
      <View style={{ position: 'absolute', top: 7 * scale }}>
        <Line length={len} color={color} thickness={t} rotateDeg={0} />
      </View>
      <View style={{ position: 'absolute', top: 12 * scale }}>
        <Line length={len} color={color} thickness={t} rotateDeg={0} />
      </View>
    </View>
  );
}

export function LockOutlineIcon({ size = 18, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 18;
  const t = strokeWidth * scale;
  const bodyW = 12 * scale;
  const bodyH = 9 * scale;
  const shackleW = 10 * scale;
  const shackleH = 8 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          top: 1.5 * scale,
          width: shackleW,
          height: shackleH,
          borderWidth: t,
          borderColor: color,
          borderBottomWidth: 0,
          borderTopLeftRadius: 6 * scale,
          borderTopRightRadius: 6 * scale,
          backgroundColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: 1.5 * scale,
          width: bodyW,
          height: bodyH,
          borderWidth: t,
          borderColor: color,
          borderRadius: 2 * scale,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

export function LinkIcon({ size = 18, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 18;
  const t = strokeWidth * scale;
  const w = 11 * scale;
  const h = 6 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: w,
          height: h,
          borderWidth: t,
          borderColor: color,
          borderRadius: h / 2,
          transform: [{ rotate: '25deg' }],
          backgroundColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: w,
          height: h,
          borderWidth: t,
          borderColor: color,
          borderRadius: h / 2,
          transform: [{ rotate: '-25deg' }],
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

export function CopyIcon({ size = 18, color = '#37352f', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 18;
  const t = strokeWidth * scale;
  const w = 11 * scale;
  const h = 12 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          top: 3 * scale,
          left: 5.5 * scale,
          width: w,
          height: h,
          borderWidth: t,
          borderColor: color,
          borderRadius: 2 * scale,
          backgroundColor: 'transparent',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 1.2 * scale,
          left: 2.5 * scale,
          width: w,
          height: h,
          borderWidth: t,
          borderColor: color,
          borderRadius: 2 * scale,
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
}

export function LogoutIcon({ size = 18, color = '#d93025', strokeWidth = 2 }: StrokeProps) {
  const scale = size / 18;
  const t = strokeWidth * scale;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      <View
        style={{
          position: 'absolute',
          left: 2 * scale,
          width: 8 * scale,
          height: 12 * scale,
          borderWidth: t,
          borderColor: color,
          borderRadius: 2 * scale,
          backgroundColor: 'transparent',
        }}
      />
      <View style={{ position: 'absolute', right: 1.5 * scale, alignSelf: 'center' }}>
        <Line length={9 * scale} color={color} thickness={t} rotateDeg={0} />
      </View>
      <View
        style={{
          position: 'absolute',
          right: 1.5 * scale,
          width: 5.5 * scale,
          height: 5.5 * scale,
          borderRightWidth: t,
          borderTopWidth: t,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
          backgroundColor: 'transparent',
        }}
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

