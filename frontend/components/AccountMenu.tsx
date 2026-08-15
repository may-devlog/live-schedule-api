import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import * as Clipboard from 'expo-clipboard';
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
  const [plan, setPlan] = useState<'free' | 'premium'>('free');
  const [isPaidEffective, setIsPaidEffective] = useState(false);
  const [trialUsed, setTrialUsed] = useState(false);
  const [trialStartedAt, setTrialStartedAt] = useState<string | null>(null);
  const [trialStarting, setTrialStarting] = useState(false);
  const [hasStripeSubscription, setHasStripeSubscription] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const fetchSharing = useCallback(async () => {
    const response = await authenticatedFetch(getApiUrl('/auth/sharing-status'));
    if (!response.ok) return;
    const data = await response.json();
    setSharingEnabled(Boolean(data.sharing_enabled));
    setShareId(data.share_id ?? null);
    setSharingUrl(data.sharing_url ?? null);
  }, []);

  const fetchPlanStatus = useCallback(async () => {
    const response = await authenticatedFetch(getApiUrl('/auth/plan-status'));
    if (!response.ok) return;
    const data = await response.json();
    setPlan(data.plan === 'premium' ? 'premium' : 'free');
    setIsPaidEffective(Boolean(data.is_paid_effective));
    setTrialUsed(Boolean(data.trial_used));
    setTrialStartedAt(data.trial_started_at ?? null);
    setHasStripeSubscription(Boolean(data.has_stripe_subscription));
  }, []);

  // トライアル終了日（開始日+1ヶ月）。バックエンドのhas_paid_access()と同じ「開始日から1ヶ月」ルールを表示用に計算する
  const trialEndsAtLabel = (() => {
    if (!trialStartedAt) return null;
    const endsAt = new Date(trialStartedAt);
    endsAt.setMonth(endsAt.getMonth() + 1);
    return `${endsAt.getFullYear()}年${endsAt.getMonth() + 1}月${endsAt.getDate()}日`;
  })();

  useEffect(() => {
    if (visible) {
      fetchSharing().catch(() => undefined);
      fetchPlanStatus().catch(() => undefined);
    }
  }, [visible, fetchSharing, fetchPlanStatus]);

  const startTrial = async () => {
    try {
      setTrialStarting(true);
      const response = await authenticatedFetch(getApiUrl('/auth/start-trial'), { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === 'trial_already_used' ? 'お試し期間は既にご利用済みです' : '無料トライアルの開始に失敗しました');
      await fetchPlanStatus();
      Alert.alert('無料トライアルを開始しました', '1ヶ月間、プレミアム機能をお使いいただけます。');
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally {
      setTrialStarting(false);
    }
  };

  // トライアルは1アカウント1回しか使えないため、誤タップで消費しないよう確認を挟む
  const confirmStartTrial = () => {
    const message = '1ヶ月無料トライアルを開始しますか？トライアルは1アカウントにつき1回のみ利用できます。';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(message)) startTrial();
    } else {
      Alert.alert('無料トライアルを開始しますか？', 'トライアルは1アカウントにつき1回のみ利用できます。', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '開始する', onPress: startTrial },
      ]);
    }
  };

  // Stripe CheckoutやBilling PortalのURLを開く。Webは同一タブで遷移し、
  // ネイティブはアプリ内ブラウザで開いて戻ってきたタイミングでプラン状況を再取得する
  const openBillingUrl = async (url: string) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.href = url;
      return;
    }
    await openBrowserAsync(url);
    await fetchPlanStatus().catch(() => undefined);
  };

  const startCheckout = async () => {
    try {
      setCheckoutLoading(true);
      const response = await authenticatedFetch(getApiUrl('/billing/create-checkout-session'), { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === 'already_premium' ? '既にプレミアムプランをご利用中です' : '決済ページの作成に失敗しました');
      await openBillingUrl(data.url);
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const openBillingPortal = async () => {
    try {
      setPortalLoading(true);
      const response = await authenticatedFetch(getApiUrl('/billing/create-portal-session'), { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error === 'no_stripe_customer' ? 'お支払い履歴が見つかりませんでした' : 'お支払い設定ページの作成に失敗しました');
      await openBillingUrl(data.url);
    } catch (error: any) {
      Alert.alert('エラー', error.message);
    } finally {
      setPortalLoading(false);
    }
  };

  const copySharingUrl = async () => {
    if (!sharingUrl) return;
    await Clipboard.setStringAsync(sharingUrl);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 1500);
  };

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
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error === 'premium_required' ? '共有化はプレミアムプラン限定の機能です。無料トライアルをお試しください。' : '共有設定の更新に失敗しました');
      }
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
                <View style={styles.shareCopy}>
                  <Text style={styles.menuLabel}>共有化{!isPaidEffective && <Text style={styles.premiumBadge}> 🔒</Text>}</Text>
                  {sharingUrl && sharingEnabled && isPaidEffective && (
                    <View style={styles.shareUrlRow}>
                      <Text numberOfLines={1} style={styles.shareUrl}>{sharingUrl}</Text>
                      <TouchableOpacity onPress={copySharingUrl} hitSlop={8}>
                        <Ionicons name={urlCopied ? 'checkmark' : 'copy-outline'} size={14} color={urlCopied ? '#16A34A' : brand.violetDark} />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
                <Switch value={sharingEnabled} onValueChange={toggleSharing} disabled={!isPaidEffective} trackColor={{ false: '#D9D4E2', true: '#A78BFA' }} thumbColor={sharingEnabled ? brand.violetDark : '#FFFFFF'} />
              </View>
            </View>
            {plan === 'premium' ? (
              <View style={styles.planCard}>
                <Ionicons name="star" size={16} color={brand.violetDark} />
                <Text style={styles.planCardText}>プレミアムプランをご利用中です</Text>
              </View>
            ) : isPaidEffective ? (
              <View style={styles.planCard}>
                <Ionicons name="time-outline" size={16} color={brand.violetDark} />
                <Text style={styles.planCardText}>無料トライアル中です（プレミアム機能を利用できます）{trialEndsAtLabel ? `\n${trialEndsAtLabel}まで` : ''}</Text>
              </View>
            ) : trialUsed ? (
              <View style={styles.planCard}>
                <Ionicons name="information-circle-outline" size={16} color={brand.muted} />
                <Text style={styles.planCardText}>無料トライアルは利用済みです</Text>
              </View>
            ) : (
              <View style={styles.trialCard}>
                <Text style={styles.trialTitle}>1ヶ月無料トライアル</Text>
                <Text style={styles.trialDescription}>共有化やアーカイブのグループ化など、プレミアム機能を1ヶ月間お試しいただけます。</Text>
                <TouchableOpacity style={styles.trialButton} onPress={confirmStartTrial} disabled={trialStarting}>
                  {trialStarting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.trialButtonText}>無料トライアルを始める</Text>}
                </TouchableOpacity>
              </View>
            )}
            {plan === 'premium' && hasStripeSubscription ? (
              <TouchableOpacity style={styles.manageBillingButton} onPress={openBillingPortal} disabled={portalLoading}>
                {portalLoading ? <ActivityIndicator color={brand.violetDark} /> : <Text style={styles.manageBillingButtonText}>お支払い方法の確認・解約</Text>}
              </TouchableOpacity>
            ) : plan === 'premium' || isPaidEffective || !trialUsed ? null : (
              <TouchableOpacity style={styles.upgradeButton} onPress={startCheckout} disabled={checkoutLoading}>
                {checkoutLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.upgradeButtonText}>プレミアムプランに登録する（月額400円）</Text>}
              </TouchableOpacity>
            )}
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
  menuGroup: { marginTop: 22, borderWidth: 1, borderColor: brand.border, borderRadius: 14, overflow: 'hidden' }, menuItem: { minHeight: 64, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: brand.border }, iconBox: { width: 34, height: 34, borderRadius: 9, backgroundColor: brand.lavender, alignItems: 'center', justifyContent: 'center' }, menuLabel: { color: brand.ink, fontSize: 14, fontWeight: '600' }, premiumBadge: { fontSize: 12 }, shareCopy: { flex: 1 }, shareUrlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }, shareUrl: { color: brand.muted, fontSize: 10, flexShrink: 1 },
  logoutButton: { marginTop: 18, minHeight: 52, borderRadius: 11, backgroundColor: '#FEF2F2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, logoutText: { color: '#DC2626', fontWeight: '700' },
  planCard: { marginTop: 18, minHeight: 44, borderRadius: 11, backgroundColor: brand.lavender, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14 }, planCardText: { color: brand.ink, fontSize: 13, fontWeight: '600', flex: 1 },
  trialCard: { marginTop: 18, borderRadius: 14, borderWidth: 1, borderColor: '#DDD6FE', backgroundColor: brand.lavender, padding: 16 }, trialTitle: { color: brand.violetDark, fontSize: 15, fontWeight: '800' }, trialDescription: { color: brand.muted, fontSize: 12, marginTop: 6, lineHeight: 18 },
  trialButton: { marginTop: 14, minHeight: 44, borderRadius: 10, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' }, trialButtonText: { color: brand.white, fontWeight: '800', fontSize: 13 },
  upgradeButton: { marginTop: 12, minHeight: 48, borderRadius: 10, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }, upgradeButtonText: { color: brand.white, fontWeight: '800', fontSize: 13, textAlign: 'center' },
  manageBillingButton: { marginTop: 12, minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: brand.violet, alignItems: 'center', justifyContent: 'center' }, manageBillingButtonText: { color: brand.violetDark, fontWeight: '700', fontSize: 13 },
  dialogOverlay: { flex: 1, backgroundColor: 'rgba(32,27,44,0.48)', alignItems: 'center', justifyContent: 'center', padding: 20 }, dialog: { width: '100%', maxWidth: 480, backgroundColor: brand.white, borderRadius: 16, padding: 24 }, dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, dialogTitle: { color: brand.ink, fontSize: 20, fontWeight: '800' }, dialogHelp: { color: brand.muted, fontSize: 13, marginTop: 18, marginBottom: 8 }, input: { minHeight: 48, borderWidth: 1, borderColor: brand.border, borderRadius: 10, paddingHorizontal: 14, color: brand.ink }, saveButton: { marginTop: 18, minHeight: 48, borderRadius: 10, backgroundColor: brand.violet, alignItems: 'center', justifyContent: 'center' }, saveText: { color: brand.white, fontWeight: '800' },
});
