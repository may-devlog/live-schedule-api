import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type SvgIconProps = {
  size?: number;
  color?: string;
  /** 未指定時は size に合わせて薄くスケール（24px 基準で stroke 2） */
  strokeWidth?: number;
};

function strokeOf(size: number, strokeWidth?: number) {
  return strokeWidth ?? (2 * size) / 24;
}

/** Feather と同系統の stroke アイコン（フォント不要・SVG パス） */
export function IconX({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="6" y1="6" x2="18" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconArrowLeft({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="19" y1="12" x2="5" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="12,19 5,12 12,5" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function IconHome({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline points="9,22 9,12 15,12 15,22" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function IconMail({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Polyline points="22,6 12,13 2,6" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

export function IconHash({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="4" y1="9" x2="20" y2="9" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="4" y1="15" x2="20" y2="15" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="10" y1="3" x2="8" y2="21" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="3" x2="14" y2="21" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconLock({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconLink({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconCopy({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconLogOut({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Polyline points="16,17 21,12 16,7" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Line x1="21" y1="12" x2="9" y2="12" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconEye({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={sw} />
    </Svg>
  );
}

export function IconEyeOff({ size = 24, color = '#37352f', strokeWidth }: SvgIconProps) {
  const sw = strokeOf(size, strokeWidth);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Line x1="1" y1="1" x2="23" y2="23" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
