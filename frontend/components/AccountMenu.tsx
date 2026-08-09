import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { authenticatedFetch, getApiUrl } from '../utils/api';

const brand = { violet: '#7C3AED', violetDark: '#5B21B6', lavender: '#F5F3FF', ink: '#201B2C', muted: '#6B6675', border: '#E8E3F1', white: '#FFFFFF' };

type AccountMenuProps = {
  visible: boolean;
  onClose: () => void;
  avatarDataUrl: string | null;
  onAvatarChange: (value: string | null) => void;
  displayName: string | null;
  onDisplayNameChange: (value: string | null) => void;
};

export function AccountMenu({ visible, onClose, avatarDataUrl, onAvatarChange, displayName, onDisplayNameChange }: AccountMenuProps) {
  const router = useRouter();
  const { email, logout, changeEmail } = useAuth();
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [sharingUrl, setSharingUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [dialog, setDialog] = useState<'name' | 'email' | 'shareId' | null>(null);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newShareId, setNewShareId] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSharing = useCallback(async () => {
    const response = await authenticatedFetch(getApiUrl('/auth/sharing-status'));
    if (!response.ok) return;
    const data = await response.json();
    setSharingEnabled(Boolean(data.sharing_enabled));
    setShareId(data.share_id ?? null);
    setSharingUrl(data.sharing_url ?? null);
  }, []);

  useEffect(() => {
    if (visible) fetchSharing().catch(() => undefined);
  }, [visible, fetchSharing]);

  const saveAvatar = async (value: string | null) => {
    const response = await authenticatedFetch(getApiUrl('/auth/profile-avatar'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar_data_url: value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'プロフィール画像の更新に失敗しました');
    onAvatarChange(data.avatar_data_url ?? null);
  };

  const pickAvatar = async () => {
    try {
      setAvatarLoading(true);
      const ImagePicker = await import('expo-image-picker');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.55, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('画像を読み込めませんでした');
      const mime = asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';
      const value = `data:${mime};base64,${asset.base64}`;
      if (value.length > 2_100_000) throw new Error('画像サイズは1.5MB以下にしてください');
      await saveAvatar(value);
    } catch (error: any) {
      Alert.alert('エラー', error.message || 'プロフィール画像の更新に失敗しました');
    } finally {
      setAvatarLoading(false);
    }
  };

  const toggleSharing = async (enabled: boolean) => {
    setSharingEnabled(enabled);
    try {
      const response = await authenticatedFetch(getApiUrl('/auth/toggle-sharing'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error('共有設定の更新に失敗しました');
      await fetchSharing();
    } catch (error: any) {
      setSharingEnabled(!enabled);
      Alert.alert('エラー', error.message);
    }
  };

  const submitEmail = async () => {
    if (!newEmail.includes('@')) return Alert.alert('エラー', '有効なメールアドレスを入力してください');
    try {
      setSaving(true);
      await changeEmail(newEmail.trim());
      setDialog(null);
      setNewEmail('');
      Alert.alert('確認メールを送信しました', 'メール内のリンクから変更を完了してください。');
    } catch (error: any) {
      Alert.alert('エラー', error.message || 'メールアドレスの変更に失敗しました');
    } finally { setSaving(false); }
  };

  const submitDisplayName = async () => {
    const value = newDisplayName.trim();
    if ([...value].length > 50) return Alert.alert('エラー', '名前は50文字以内で入力してください');
    try {
      setSaving(true);
      const response = await authenticatedFetch(getApiUrl('/auth/profile'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: value || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '名前の更新に失敗しました');
      onDisplayNameChange(data.display_name ?? null);
      setDialog(null);
      setNewDisplayName('');
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally { setSaving(false); }
  };

  const submitShareId = async () => {
    const value = newShareId.trim();
    if (!/^[a-zA-Z0-9_-]{3,20}$/.test(value)) return Alert.alert('エラー', '3〜20文字の英数字・ハイフン・アンダースコアで入力してください');
    try {
      setSaving(true);
      const response = await authenticatedFetch(getApiUrl('/auth/change-share-id'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ share_id: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ユーザーIDの変更に失敗しました');
      setShareId(data.share_id);
      setDialog(null);
      setNewShareId('');
      await fetchSharing();
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally { setSaving(false); }
  };

  const confirmLogout = () => {
    const perform = async () => { onClose(); await logout(); router.replace('/login'); };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('ログアウトしますか？')) perform();
    } else Alert.alert('ログアウト', 'ログアウトしますか？', [{ text: 'キャンセル' }, { text: 'ログアウト', style: 'destructive', onPress: perform }]);
  };

  const menuItem = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <View style={styles.iconBox}><Ionicons name={icon} size={19} color={brand.violetDark} /></View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#AAA3B5" />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View><Text style={styles.eyebrow}>ACCOUNT</Text><Text style={styles.title}>アカウントメニュー</Text></View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}><Ionicons name="close" size={23} color={brand.ink} /></TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.profileCard}>
              <View style={styles.avatar}>{avatarDataUrl ? <Image source={{ uri: avatarDataUrl }} style={styles.avatarImage} /> : <Ionicons name="person-outline" size={31} color={brand.violet} />}</View>
              <View style={styles.profileCopy}><Text style={styles.profileName}>{displayName || shareId || email?.split('@')[0] || 'ユーザー'}</Text><Text style={styles.email}>{email}</Text></View>
              <TouchableOpacity style={styles.avatarButton} onPress={pickAvatar} disabled={avatarLoading}>{avatarLoading ? <ActivityIndicator color={brand.violet} /> : <Text style={styles.avatarButtonText}>画像を変更</Text>}</TouchableOpacity>
            </View>
            {avatarDataUrl && <TouchableOpacity onPress={() => saveAvatar(null)}><Text style={styles.removeAvatar}>プロフィール画像を削除</Text></TouchableOpacity>}
            <View style={styles.menuGroup}>
              {menuItem('person-outline', '名前変更', () => { setNewDisplayName(displayName || ''); setDialog('name'); })}
              {menuItem('mail-outline', 'メールアドレス変更', () => setDialog('email'))}
              {menuItem('at-outline', 'ユーザーID変更', () => setDialog('shareId'))}
              {menuItem('shield-checkmark-outline', '出発地・到着地マスク設定', () => { onClose(); router.push('/settings/masked-locations'); })}
              <View style={styles.menuItem}>
                <View style={styles.iconBox}><Ionicons name="share-social-outline" size={19} color={brand.violetDark} /></View>
                <View style={styles.shareCopy}><Text style={styles.menuLabel}>共有化</Text>{sharingUrl && sharingEnabled && <Text numberOfLines={1} style={styles.shareUrl}>{sharingUrl}</Text>}</View>
                <Switch value={sharingEnabled} onValueChange={toggleSharing} trackColor={{ false: '#D9D4E2', true: '#A78BFA' }} thumbColor={sharingEnabled ? brand.violetDark : '#FFFFFF'} />
              </View>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={confirmLogout}><Ionicons name="log-out-outline" size={19} color="#DC2626" /><Text style={styles.logoutText}>ログアウト</Text></TouchableOpacity>
          </ScrollView>
        </View>
      </View>
      <Modal visible={dialog !== null} transparent animationType="fade" onRequestClose={() => setDialog(null)}>
        <View style={styles.dialogOverlay}><View style={styles.dialog}>
          <View style={styles.dialogHeader}><Text style={styles.dialogTitle}>{dialog === 'name' ? '名前変更' : dialog === 'email' ? 'メールアドレス変更' : 'ユーザーID変更'}</Text><TouchableOpacity onPress={() => setDialog(null)}><Ionicons name="close" size={22} color={brand.ink} /></TouchableOpacity></View>
          <Text style={styles.dialogHelp}>{dialog === 'name' ? `現在: ${displayName || '未設定'}` : dialog === 'email' ? `現在: ${email}` : `現在: ${shareId || '未設定'}`}</Text>
          <TextInput style={styles.input} value={dialog === 'name' ? newDisplayName : dialog === 'email' ? newEmail : newShareId} onChangeText={dialog === 'name' ? setNewDisplayName : dialog === 'email' ? setNewEmail : setNewShareId} placeholder={dialog === 'name' ? '名前（50文字以内）' : dialog === 'email' ? '新しいメールアドレス' : '新しいユーザーID'} autoCapitalize={dialog === 'name' ? 'sentences' : 'none'} maxLength={dialog === 'name' ? 50 : undefined} />
          <TouchableOpacity style={styles.saveButton} onPress={dialog === 'name' ? submitDisplayName : dialog === 'email' ? submitEmail : submitShareId} disabled={saving}>{saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>変更する</Text>}</TouchableOpacity>
        </View></View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(32,27,44,0.48)', alignItems: 'flex-end' },
  panel: { width: '100%', maxWidth: 440, height: '100%', backgroundColor: brand.white, paddingHorizontal: 26, paddingTop: 28, paddingBottom: 24, shadowColor: '#1C1133', shadowOpacity: 0.2, shadowRadius: 28 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 22 },
  eyebrow: { color: brand.violet, fontWeight: '800', fontSize: 11, letterSpacing: 1.5, marginBottom: 4 }, title: { color: brand.ink, fontSize: 24, fontWeight: '800' },
  closeButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: brand.lavender, alignItems: 'center', justifyContent: 'center' },
  profileCard: { backgroundColor: brand.lavender, borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 27, backgroundColor: brand.white, borderWidth: 2, borderColor: '#DDD6FE', alignItems: 'center', justifyContent: 'center' }, avatarImage: { width: '100%', height: '100%', borderRadius: 27 },
  profileCopy: { flex: 1, minWidth: 0 }, profileName: { color: brand.ink, fontSize: 16, fontWeight: '800' }, email: { color: brand.muted, fontSize: 12, marginTop: 3 },
  avatarButton: { minHeight: 38, borderWidth: 1, borderColor: brand.violet, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' }, avatarButtonText: { color: brand.violetDark, fontSize: 12, fontWeight: '700' }, removeAvatar: { color: brand.muted, textAlign: 'right', fontSize: 12, marginTop: 8 },
  menuGroup: { marginTop: 22, borderWidth: 1, borderColor: brand.border, borderRadius: 14, overflow: 'hidden' }, menuItem: { minHeight: 64, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: brand.border }, iconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: brand.lavender, alignItems: 'center', justifyContent: 'center' }, menuLabel: { color: brand.ink, fontSize: 14, fontWeight: '600' }, shareCopy: { flex: 1 }, shareUrl: { color: brand.muted, fontSize: 10, marginTop: 3 },
  logoutButton: { marginTop: 18, minHeight: 52, borderRadius: 11, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, logoutText: { color: '#DC2626', fontWeight: '700' },
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(32,27,44,0.48)', alignItems: 'center', justifyContent: 'center', padding: 20 }, dialog: { width: '100%', maxWidth: 480, backgroundColor: brand.white, borderRadius: 16, padding: 24 }, dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, dialogTitle: { color: brand.ink, fontSize: 20, fontWeight: '800' }, dialogHelp: { color: brand.muted, fontSize: 13, marginTop: 18, marginBottom: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingHorizontal: 14, color: brand.ink }, saveButton: { marginTop: 18, minHeight: 48, borderRadius: 10, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' }, saveText: { color: brand.white, fontWeight: '800' },
});
