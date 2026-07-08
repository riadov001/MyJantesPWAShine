import React from 'react';
import { Tabs } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { typography, useTheme } from '@/lib/theme';
import { useAuth } from '@/lib/auth-context';

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return (
    <Text
      accessibilityElementsHidden
      style={{ fontSize: 20, color, fontFamily: typography.semibold }}
    >
      {symbol}
    </Text>
  );
}

function NotifIconWithBadge({ color }: { color: string }) {
  const { client, isAuthenticated } = useAuth();
  const t = useTheme();
  const q = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => client.getUnreadNotificationCount(),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });
  const count = q.data ?? 0;
  return (
    <View>
      <TabIcon symbol="🔔" color={color} />
      {count > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -10,
            backgroundColor: t.primary,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 10, fontFamily: typography.bold }}>
            {count > 99 ? '99+' : count}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function AdminTabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopColor: t.border,
        },
        tabBarLabelStyle: {
          fontFamily: typography.medium,
          fontSize: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tableau',
          tabBarIcon: ({ color }) => <TabIcon symbol="📊" color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color }) => <TabIcon symbol="👥" color={color} />,
        }}
      />
      <Tabs.Screen
        name="devis"
        options={{
          title: 'Devis',
          tabBarIcon: ({ color }) => <TabIcon symbol="📄" color={color} />,
        }}
      />
      <Tabs.Screen
        name="factures"
        options={{
          title: 'Factures',
          tabBarIcon: ({ color }) => <TabIcon symbol="🧾" color={color} />,
        }}
      />
      <Tabs.Screen
        name="reservations"
        options={{
          title: 'Agenda',
          tabBarIcon: ({ color }) => <TabIcon symbol="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color }) => <TabIcon symbol="👤" color={color} />,
        }}
      />
    </Tabs>
  );
}
