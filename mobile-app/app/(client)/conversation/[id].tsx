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

export default function ConversationScreen() {
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
    refetchInterval: 30_000,
  });

  // Fetch conversations to derive other participants' lastReadAt for read receipts.
  const conversationsQ = useQuery<ChatConversation[]>({
    queryKey: ['conversations'],
    queryFn: () => client.listConversations(),
    refetchInterval: 60_000,
  });

  const othersLastReadAt = useMemo(() => {
    const conv = conversationsQ.data?.find((c) => c.id === id);
    if (!conv?.participants || !user) return null;
    const others = conv.participants.filter((p) => (p.userId ?? p.user?.id) !== user.id);
    if (others.length === 0) return null;
    let earliest: number | null = null;
    for (const p of others) {
      if (!p.lastReadAt) return null; // someone has never read → cannot mark anything as read
      const ts = new Date(p.lastReadAt).getTime();
      if (Number.isNaN(ts)) return null;
      if (earliest === null || ts < earliest) earliest = ts;
    }
    return earliest;
  }, [conversationsQ.data, id, user]);

  useEffect(() => {
    if (id) {
      client.markConversationRead(id).catch(() => undefined);
    }
  }, [id, client, messagesQ.data?.length]);

  useEffect(() => {
    if (messagesQ.data && messagesQ.data.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messagesQ.data?.length]);

  const sendMut = useMutation({
    mutationFn: async () => {
      let attachments: { url: string; fileName?: string; fileType?: 'image'; mimeType?: string }[] | undefined;
      if (pendingImage) {
        const uploaded = await client.uploadImage(pendingImage);
        attachments = [
          {
            url: uploaded.url,
            fileName: uploaded.fileName ?? pendingImage.name,
            fileType: 'image',
            mimeType: uploaded.mimeType ?? pendingImage.type,
          },
        ];
      }
      return client.sendMessage(id, { content: text.trim(), attachments });
    },
    onSuccess: () => {
      setText('');
      setPendingImage(null);
      qc.invalidateQueries({ queryKey: ['messages', id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err) =>
      Alert.alert('Erreur', errorMessage(err, "Envoi impossible.")),
  });

  const onPickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Autorisation requise', 'Activez l’accès aux photos pour joindre une image.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setPendingImage({
      uri: a.uri,
      name: a.fileName ?? `photo_${Date.now()}.jpg`,
      type: a.mimeType ?? 'image/jpeg',
    });
  }, []);

  const onSend = useCallback(() => {
    if (!text.trim() && !pendingImage) return;
    sendMut.mutate();
  }, [text, pendingImage, sendMut]);

  const messages = useMemo(() => messagesQ.data ?? [], [messagesQ.data]);

  if (messagesQ.isLoading) return <ScreenLoader />;
  if (messagesQ.isError) {
    return (
      <ErrorState
        error={messagesQ.error}
        onRetry={() => messagesQ.refetch()}
        retrying={messagesQ.isFetching}
        title="Impossible de charger la conversation"
      />
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.background }}>
      <Stack.Screen options={{ title: 'Conversation' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const mine = item.senderId === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowOther]}>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine ? t.primary : t.card,
                      borderColor: t.border,
                      borderWidth: mine ? 0 : 1,
                    },
                  ]}
                >
                  {item.attachments?.map((a) =>
                    a.fileType === 'image' ? (
                      <Image
                        key={a.id}
                        source={{ uri: a.filePath }}
                        style={styles.attachmentImage}
                        resizeMode="cover"
                      />
                    ) : null,
                  )}
                  {item.content && item.content !== '[Pièce jointe]' ? (
                    <Text
                      style={[
                        styles.bubbleText,
                        { color: mine ? '#fff' : t.text },
                      ]}
                    >
                      {item.content}
                    </Text>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Text
                      style={[
                        styles.bubbleMeta,
                        { color: mine ? 'rgba(255,255,255,0.8)' : t.textMuted },
                      ]}
                    >
                      {formatDateTimeFR(item.createdAt)}
                    </Text>
                    {mine ? (() => {
                      const sentTs = item.createdAt ? new Date(item.createdAt).getTime() : null;
                      const seen =
                        sentTs !== null &&
                        othersLastReadAt !== null &&
                        othersLastReadAt >= sentTs;
                      return (
                        <Text
                          accessibilityLabel={seen ? 'Lu' : 'Envoyé'}
                          testID={`message-status-${item.id}`}
                          style={[
                            styles.bubbleMeta,
                            { color: seen ? '#a7f3d0' : 'rgba(255,255,255,0.6)', marginLeft: 6 },
                          ]}
                        >
                          {seen ? '✓✓' : '✓'}
                        </Text>
                      );
                    })() : null}
                  </View>
                </View>
              </View>
            );
          }}
        />

        {pendingImage ? (
          <View style={[styles.previewRow, { borderColor: t.border, backgroundColor: t.card }]}>
            <Image source={{ uri: pendingImage.uri }} style={styles.previewImage} />
            <Text style={{ flex: 1, color: t.textMuted, fontFamily: typography.regular }} numberOfLines={1}>
              {pendingImage.name}
            </Text>
            <TouchableOpacity onPress={() => setPendingImage(null)}>
              <Text style={{ color: t.destructive, fontFamily: typography.semibold }}>Retirer</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={[styles.inputRow, { backgroundColor: t.card, borderTopColor: t.border }]}>
          <TouchableOpacity onPress={onPickImage} testID="button-pick-image" style={styles.iconBtn}>
            <Text style={{ fontSize: 22 }}>📷</Text>
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Écrire un message…"
            placeholderTextColor={t.placeholder}
            style={[
              styles.input,
              {
                backgroundColor: t.inputBg,
                borderColor: t.border,
                color: t.text,
              },
            ]}
            multiline
            testID="input-message"
          />
          <TouchableOpacity
            onPress={onSend}
            disabled={sendMut.isPending || (!text.trim() && !pendingImage)}
            style={[
              styles.sendBtn,
              {
                backgroundColor: t.primary,
                opacity: sendMut.isPending || (!text.trim() && !pendingImage) ? 0.5 : 1,
              },
            ]}
            testID="button-send"
          >
            <Text style={{ color: '#fff', fontFamily: typography.semibold }}>
              {sendMut.isPending ? '…' : 'Envoyer'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.lg },
  bubbleRow: { flexDirection: 'row', marginVertical: 4 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: radius.lg,
  },
  bubbleText: { fontSize: 15, fontFamily: typography.regular },
  bubbleMeta: { fontSize: 10, fontFamily: typography.regular, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  attachmentImage: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { padding: spacing.sm },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 15,
    fontFamily: typography.regular,
  },
  sendBtn: {
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  previewImage: { width: 40, height: 40, borderRadius: radius.sm },
});
