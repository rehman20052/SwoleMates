import { useSyncExternalStore } from "react";
import { Modal, Pressable, ScrollView, View, type AlertButton, type AlertOptions } from "react-native";
import { AppText } from "./ui";
import { useAppTheme } from "@/theme";

type Message = { title: string; message?: string; buttons: AlertButton[]; options?: AlertOptions };
let queue: Message[] = [];
const listeners = new Set<() => void>();
function notify() { listeners.forEach(listener => listener()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

// Keep confirmations and status messages in the app's typography on every platform.
export const AppAlert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    queue = [...queue, { title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }], options }];
    notify();
  },
};

export function AppAlertHost() {
  const item = useSyncExternalStore(subscribe, () => queue[0], () => undefined);
  const theme = useAppTheme();
  function close(button?: AlertButton) {
    queue = queue.slice(1);
    notify();
    if (button) button.onPress?.();
    else item?.options?.onDismiss?.();
  }
  function dismiss() {
    if (!item?.options?.cancelable) return;
    const cancel = item.buttons.find(button => button.style === "cancel");
    close(cancel);
  }
  return <Modal visible={!!item} transparent animationType="fade" onRequestClose={dismiss}>
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: theme.colors.modalOverlay }}>
      <Pressable accessibilityLabel="Dismiss message" onPress={dismiss} style={{ position: "absolute", inset: 0 }} />
      {item ? <View accessibilityViewIsModal role="alertdialog" style={{ width: "100%", maxWidth: 420, maxHeight: "85%", padding: 24, gap: 16, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }}>
        <AppText display size={28} accessibilityRole="header">{item.title}</AppText>
        {item.message ? <ScrollView><AppText display={false} size={16} style={{ lineHeight: 24 }}>{item.message}</AppText></ScrollView> : null}
        <View style={{ gap: 8 }}>{item.buttons.map((button, index) => <Pressable key={index} accessibilityRole="button" onPress={() => close(button)} style={{ minHeight: 48, padding: 12, justifyContent: "center", alignItems: "center", borderRadius: 8, backgroundColor: button.style === "cancel" ? theme.colors.surfaceRaised : theme.colors.primary }}>
          <AppText display={false} weight="semibold" size={16} color={button.style === "destructive" ? theme.colors.danger : button.style === "cancel" ? theme.colors.text : theme.colors.primaryText}>{button.text ?? "OK"}</AppText>
        </Pressable>)}</View>
      </View> : null}
    </View>
  </Modal>;
}
