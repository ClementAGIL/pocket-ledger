import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TextLink } from '@/components/ui';
import { useTheme } from '@/theme';

export default function TabLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        headerStyle: { backgroundColor: theme.background },
        headerShadowVisible: false,
        headerTintColor: theme.text,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Portfolio',
          headerShown: false,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'pie-chart' : 'pie-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="investments"
        options={{
          title: 'Investments',
          headerRight: () => (
            <TextLink
              title="Update prices"
              icon="pricetags-outline"
              size={15}
              onPress={() => router.push('/update-prices')}
              style={{ marginRight: 16 }}
            />
          ),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'layers' : 'layers-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: 'Add',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'add-circle' : 'add-circle-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
