import React from "react";
import { StyleSheet, Text, View } from "react-native";

type BooleanSelectDisplayProps = {
  value: boolean;
};

export function BooleanSelectDisplay({ value }: BooleanSelectDisplayProps) {
  return (
    <View
      style={styles.container}
      accessibilityLabel={`${value ? "オン" : "オフ"}（${value ? "あり" : "なし"}）`}
    >
      <View style={[styles.track, value ? styles.trackOn : styles.trackOff]}>
        <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
      </View>
      <Text style={[styles.text, value ? styles.textOn : styles.textOff]}>
        {value ? "あり" : "なし"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  track: {
    width: 42,
    height: 24,
    padding: 3,
    borderRadius: 12,
    justifyContent: "center",
  },
  trackOn: {
    backgroundColor: "#7C3AED",
  },
  trackOff: {
    backgroundColor: "#D6D0DE",
  },
  thumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FFFFFF",
  },
  thumbOn: {
    alignSelf: "flex-end",
  },
  thumbOff: {
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
  },
  textOn: {
    color: "#5B21B6",
  },
  textOff: {
    color: "#706878",
  },
});
