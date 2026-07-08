import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ScreenLoader } from '@/components/ScreenLoader';
import { ErrorState } from '@/components/ErrorState';
import { useAuth } from '@/lib/auth-context';
import { radius, spacing, typography, useTheme } from '@/lib/theme';
import { errorMessage } from '@/lib/format';
import { formatDateTimeFR } from '@/lib/format-extra';
import type { ChatConversation, ChatMessage } from '@/lib/sdk';

export default function AdminConversationScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client, user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<{ uri: string; name: string; type: string } | null>(null);
  const listRef = useRef<FlatList<ChatMessage> | null>(null);

  const messagesQ = useQuery<ChatMessage[]>({
    queryKey: ['messages', id],
    queryFn: () => client.listMessages(id),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  const conversationsQ = useQuery<ChatConversation[]>({
    queryKey: ['conversations'],
    queryFn: () => client.listConversations(),
    refetchInterval: 60_000,
  });

  const othersLastReadAt = useMemo(() => {
    const conv = conversationsQ.data?.find((c) => c.id === id);
    if (!conv?.participants) return null;
    const others = conv.participants.filter((p) => p.user?.id !== user?.id);
    const latest = others.reduce((max, p) => {
      const t2 = p.lastReadAt ? new Date(p.lastReadAt).getTime() : 0;
      return t2 > max ? t2 : max;
    }, 0);
    return latest || null;
  }, [conversationsQ.data, id, user?.id]);

  const markReadMut = useMutation({
    mutationFn: () => client.markConversationRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-unread'] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  useEffect(() => {
    if (messagesQ.data?.length) {
      markReadMut.mutate();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100);
    }
  }, [messagesQ.data]);

  const sendMut = useMutation({
    mutationFn: async () => {
      let attachments: { url: string; fileName?: string; fileType?: 'image'; mimeType?: string }[] = [];
      if (pendingImage) {
        const up = await client.uploadImage(pendingImage);
        attachments = [{ url: up.url, fileName: up.fileName, fileType: 'image', mimeType: up.mimeType }];
      }
      return client.sendMessage(id, { content: text.trim() || undefined, attachments });
    },
    onSuccess: (msg) => {
      setText('');
      setPendingImage(null);
      qc.setQueryData<ChatMessage[]>(['messages', id], (old) => [...(old ?? []), msg]);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    },
    onError: (err) => Alert.alert('Erreur', errorMessage(err, "Envoi impossible.")),
  });

  const onPickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Autorisation requise', "Autorisez l'accès à vos photos."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPendingImage({ uri: asset.uri, name: asset.fileName ?? `img_${Date.now()}.jpg`, type: asset.mimeType ?? 'image/jpeg' });
  }, []);

  const canSend = (text.trim().length > 0 || pendingImage !== null) && !sendMut.isPending;

  if (messagesQ.isLoading) return <ScreenLoader />;
  if (messagesQ.isError) {
    return <ErrorState error={messagesQ.error} onRetry={() => messagesQ.refetch()} retrying={messagesQ.isFetching} title="Conversation indisponible" />;
  }

  const messages = messagesQ.data ?? [];
  const conv = conversationsQ.data?.find((c) => c.id === id);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: conv?.title ?? 'Conversation' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const isMine = item.senderId === user?.id;
            const isRead = othersLastReadAt ? new Date(item.createdAt ?? 0).getTime() <= othersLastReadAt : false;
            const prevMsg = messages[index - 1];
            const showSender = !isMine && item.sender && (!prevMsg || prevMsg.senderId !== item.senderId);
            return (
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {showSender ? (
                  <Text style={[styles.senderName, { color: t.primary }]}>
                    {item.sender?.firstName ?? item.sender?.email ?? ''}
                  </Text>
                ) : null}
                {item.attachments?.map((att) =>
                  att.fileType === 'image' ? (
                    <Image
                      key={att.id}
                      source={{ uri: client.getBaseUrl() + att.filePath }}
                      style={styles.attachImg}
                      resizeMode="cover"
                    />
                  ) : null,
                )}
                {item.content ? (
                  <Text style={[styles.bubbleText, { color: isMine ? '#fff' : t.text, backgroundColor: isMine ? t.primary : t.card }]}>
                    {item.content}
                  </Text>
                ) : null}
                <View style={[styles.metaRow, isMine && { justifyContent: 'flex-end' }]}>
                  <Text style={[styles.timestamp, { color: t.textMuted }]}>
                    {formatDateTimeFR(item.createdAt)}
                  </Text>
                  {isMine ? <Text style={{ color: t.textMuted, fontSize: 11 }}>{isRead ? ' ✓✓' : ' ✓'}</Text> : null}
                </View>
              </View>
            );
          }}
        />
        {pendingImage ? (
          <View style={[styles.pendingImgWrap, { backgroundColor: t.inputBg, borderTopColor: t.border }]}>
            <Image source={{ uri: pendingImage.uri }} style={styles.pendingImg} />
            <TouchableOpacity onPress={() => setPendingImage(null)} style={styles.removeImg}>
              <Text style={{ color: '#fff', fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={[styles.inputBar, { backgroundColor: t.card, borderTopColor: t.border }]}>
          <TouchableOpacity onPress={onPickImage} style={styles.attachBtn}>
            <Text style={{ fontSize: 22 }}>📎</Text>
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { color: t.text, backgroundColor: t.inputBg, borderColor: t.border }]}
            placeholder="Message…"
            placeholderTextColor={t.placeholder}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity
            onPress={() => sendMut.mutate()}
            disabled={!canSend}
            style={[styles.sendBtn, { backgroundColor: canSend ? t.primary : t.border }]}
          >
            <Text style={{ color: '#fff', fontSize: 18 }}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.md, paddingBottom: spacing.sm },
  bubble: { marginBottom: spacing.sm, maxWidth: '85%' },
  bubbleMine: { alignSelf: 'flex-end' },
  bubbleTheirs: { alignSelf: 'flex-start' },
  senderName: { fontSize: 11, fontFamily: typography.semibold, marginBottom: 3 },
  bubbleText: {
    fontSize: 15,
    fontFamily: typography.regular,
    lineHeight: 22,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  attachImg: { width: 200, height: 150, borderRadius: radius.md, marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  timestamp: { fontSize: 10, fontFamily: typography.regular },
  pendingImgWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderTopWidth: 1,
  },
  pendingImg: { width: 60, height: 60, borderRadius: 8 },
  removeImg: {
    position: 'absolute',
    top: 4,
    left: 52,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  attachBtn: { paddingBottom: 10, paddingHorizontal: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxHeight: 120,
    fontSize: 15,
    fontFamily: typography.regular,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
