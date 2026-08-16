import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { authenticatedFetch, getApiUrl } from '../utils/api';

const brand = {
  violet: '#7C3AED',
  violetDark: '#5B21B6',
  plum: '#2E1065',
  lavender: '#F5F3FF',
  ink: '#201B2C',
  muted: '#6B6675',
  border: '#E8E3F1',
  white: '#FFFFFF',
};

type Notification = {
  id: number;
  stay_id: number;
  schedule_id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

function formatDeadlineMessage(message: string): string {
  return message
    .split('\n')
    .map((line) => {
      if (!line.startsWith('期限日時:')) return line;
      const rawDeadline = line.slice('期限日時:'.length).trim();
      const deadline = new Date(rawDeadline);
      if (Number.isNaN(deadline.getTime())) return line;
      const pad = (value: number) => String(value).padStart(2, '0');
      return `期限日時: ${deadline.getFullYear()}.${pad(deadline.getMonth() + 1)}.${pad(deadline.getDate())} ${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`;
    })
    .join('\n');
}

type NotificationMenuProps = {
  hideTrigger?: boolean;
  visible?: boolean;
  onClose?: () => void;
};

export function NotificationMenu({ hideTrigger = false, visible: controlledVisible, onClose }: NotificationMenuProps = {}) {
  const router = useRouter();
  const [internalVisible, setInternalVisible] = useState(false);
  const visible = controlledVisible ?? internalVisible;
  const setVisible = (next: boolean) => {
    setInternalVisible(next);
    if (!next) onClose?.();
  };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  const fetchNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(getApiUrl('/notifications'));
      if (!response.ok) throw new Error('通知の取得に失敗しました');
      setNotifications(await response.json());
    } catch (fetchError: any) {
      if (showLoading) setError(fetchError?.message || '通知の取得に失敗しました');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications().catch(() => undefined);
    const interval = setInterval(() => fetchNotifications().catch(() => undefined), 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    if (visible) fetchNotifications(true).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const open = () => {
    setVisible(true);
    fetchNotifications(true).catch(() => undefined);
  };

  const selectNotification = async (notification: Notification) => {
    if (!notification.is_read) {
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, is_read: true } : item));
      await authenticatedFetch(getApiUrl(`/notifications/${notification.id}/read`), { method: 'PUT' }).catch(() => undefined);
    }
    setVisible(false);
    router.push(`/live/${notification.schedule_id}`);
  };

  return (
    <>
      {!hideTrigger && (
        <TouchableOpacity style={styles.bellButton} onPress={open} accessibilityLabel="通知を開く">
          <Ionicons name="notifications-outline" size={23} color={brand.violetDark} />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setVisible(false)} activeOpacity={1} />
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <View>
                <Text style={styles.eyebrow}>NOTIFICATIONS</Text>
                <Text style={styles.title}>通知</Text>
              </View>
              <TouchableOpacity style={styles.closeButton} onPress={() => setVisible(false)} accessibilityLabel="通知を閉じる">
                <Ionicons name="close" size={23} color={brand.ink} />
              </TouchableOpacity>
            </View>

            {loading && <View style={styles.center}><ActivityIndicator color={brand.violet} /></View>}
            {!loading && error && (
              <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={30} color="#DC2626" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={() => fetchNotifications(true)}><Text style={styles.retryText}>再読み込み</Text></TouchableOpacity>
              </View>
            )}
            {!loading && !error && notifications.length === 0 && (
              <View style={styles.center}>
                <View style={styles.emptyIcon}><Ionicons name="notifications-outline" size={30} color={brand.violet} /></View>
                <Text style={styles.emptyTitle}>新しい通知はありません</Text>
                <Text style={styles.emptyHelp}>宿泊の取消料発生日時が近づくと、ここにお知らせします。</Text>
              </View>
            )}
            {!loading && !error && notifications.length > 0 && (
              <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                {notifications.map((notification) => (
                  <TouchableOpacity
                    key={notification.id}
                    style={[styles.item, !notification.is_read && styles.unreadItem]}
                    onPress={() => selectNotification(notification)}
                  >
                    <View style={[styles.itemIcon, !notification.is_read && styles.unreadIcon]}>
                      <Ionicons name="bed-outline" size={19} color={brand.violetDark} />
                    </View>
                    <View style={styles.itemCopy}>
                      <View style={styles.itemTitleRow}>
                        <Text style={styles.itemTitle}>{notification.title}</Text>
                        {!notification.is_read && <View style={styles.unreadDot} />}
                      </View>
                      <Text style={styles.itemMessage}>{formatDeadlineMessage(notification.message)}</Text>
                      <Text style={styles.itemDate}>{new Date(notification.created_at).toLocaleString('ja-JP')}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#AAA3B5" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: brand.lavender, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, backgroundColor: '#DC2626', borderWidth: 2, borderColor: brand.white, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: brand.white, fontSize: 10, lineHeight: 12, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(32,27,44,0.48)', alignItems: 'flex-end' },
  panel: { width: '100%', maxWidth: 440, height: '100%', backgroundColor: brand.white, paddingHorizontal: 26, paddingTop: 28, paddingBottom: 24, shadowColor: '#1C1133', shadowOpacity: 0.2, shadowRadius: 28 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: brand.border },
  eyebrow: { color: brand.violet, fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 4 },
  title: { color: brand.ink, fontSize: 24, fontWeight: '800' },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: brand.lavender, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: brand.lavender, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { color: brand.ink, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  emptyHelp: { color: brand.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  errorText: { color: '#B91C1C', fontSize: 13, marginTop: 10 },
  retryButton: { marginTop: 16, minHeight: 40, paddingHorizontal: 18, borderRadius: 9, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' },
  retryText: { color: brand.white, fontWeight: '700', fontSize: 13 },
  list: { flex: 1 },
  listContent: { paddingVertical: 16, gap: 10 },
  item: { minHeight: 108, borderWidth: 1, borderColor: brand.border, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: brand.white },
  unreadItem: { backgroundColor: brand.lavender, borderColor: '#DDD6FE' },
  itemIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: '#F3F0F7', alignItems: 'center', justifyContent: 'center' },
  unreadIcon: { backgroundColor: '#EDE9FE' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemTitle: { flex: 1, color: brand.ink, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: brand.violet },
  itemMessage: { color: brand.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  itemDate: { color: '#928B9E', fontSize: 11, marginTop: 7 },
});
