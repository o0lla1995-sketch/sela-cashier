/**
 * ui.tsx — مكونات مشتركة صغيرة (شرائح، حالة فارغة، توست) بنفس لغة
 * تصميم سيلا — بلا أي مكتبة خارجية.
 */
import React from 'react';
import {
  ActivityIndicator,
  I18nManager,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {create} from 'zustand';
import {fonts, palette, spacing, typography} from './theme';

export function Chip({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning';
}) {
  const colors = {
    neutral: {bg: palette.surfaceHi, fg: palette.textDim},
    accent: {bg: palette.accentSoft, fg: palette.accent},
    success: {bg: palette.successSoft, fg: palette.success},
    danger: {bg: palette.dangerSoft, fg: palette.danger},
    warning: {bg: 'rgba(234,179,8,0.15)', fg: palette.warning},
  }[tone];
  return (
    <View style={[chipStyles.wrap, {backgroundColor: colors.bg}]}>
      <Text style={[chipStyles.text, {color: colors.fg}]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  wrap: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.medium,
    fontSize: typography.micro + 1,
  },
});

export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={emptyStyles.wrap}>
      <Text style={emptyStyles.title}>{title}</Text>
      <Text style={emptyStyles.message}>{message}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  wrap: {alignItems: 'center', padding: spacing.xl, gap: 6},
  title: {
    color: palette.text,
    fontFamily: fonts.bold,
    fontSize: typography.body,
    textAlign: 'center',
  },
  message: {
    color: palette.textDim,
    fontFamily: fonts.regular,
    fontSize: typography.small,
    textAlign: 'center',
    lineHeight: 19,
  },
});

export function LabeledInput({
  label,
  value,
  onChangeText,
  placeholder,
  secure = false,
  numeric = false,
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secure?: boolean;
  numeric?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={inputStyles.wrap}>
      <Text style={inputStyles.label}>{label}</Text>
      <View style={inputStyles.box}>
        <TextInput
          style={inputStyles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.textFaint}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          autoFocus={autoFocus}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />
      </View>
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrap: {gap: 5},
  label: {
    color: palette.textDim,
    fontFamily: fonts.medium,
    fontSize: typography.small,
    textAlign: 'right',
  },
  box: {
    backgroundColor: palette.surfaceHi,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  input: {
    color: palette.text,
    fontFamily: fonts.regular,
    fontSize: typography.body,
    paddingVertical: 11,
  },
});

export function BigButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'success' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const styles = {
    primary: {bg: palette.accent, fg: palette.onAccent},
    ghost: {bg: 'transparent', fg: palette.accent},
    success: {bg: palette.success, fg: palette.onAccent},
    danger: {bg: 'rgba(239,68,68,0.15)', fg: palette.danger},
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[
        bigStyles.btn,
        {backgroundColor: styles.bg},
        variant === 'ghost' ? {borderWidth: 1, borderColor: palette.border} : null,
        disabled ? {opacity: 0.5} : null,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={styles.fg} />
      ) : (
        <Text
          style={[
            bigStyles.text,
            {color: styles.fg, fontFamily: variant === 'ghost' ? fonts.medium : fonts.bold},
          ]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const bigStyles = StyleSheet.create({
  btn: {
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    flexDirection: 'row-reverse',
    gap: 8,
  },
  text: {fontSize: typography.body},
});

// ── توست خفيف ─────────────────────────────────────────────────────
interface ToastState {
  message: string | null;
  tone: 'info' | 'success' | 'error';
  show: (message: string, tone?: 'info' | 'success' | 'error') => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>(set => ({
  message: null,
  tone: 'info',
  show: (message, tone = 'info') => set({message, tone}),
  clear: () => set({message: null}),
}));

export function Toaster() {
  const message = useToastStore(s => s.message);
  const tone = useToastStore(s => s.tone);
  const clear = useToastStore(s => s.clear);
  React.useEffect(() => {
    if (message) {
      const timer = setTimeout(clear, 3200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [message, clear]);
  if (!message) {
    return null;
  }
  const color =
    tone === 'success'
      ? palette.success
      : tone === 'error'
      ? palette.danger
      : palette.accent;
  return (
    <View style={toastStyles.overlay} pointerEvents="none">
      <View style={[toastStyles.card, {borderColor: color}]}>
        <Text style={[toastStyles.text, {color}]}>{message}</Text>
      </View>
    </View>
  );
}

const toastStyles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 90,
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  card: {
    backgroundColor: palette.surface,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 18,
    maxWidth: '100%',
  },
  text: {
    fontFamily: fonts.bold,
    fontSize: typography.small + 1,
    textAlign: 'center',
  },
});

/** نافذة سفلية بسيطة (بلا مكتبات) — نفس نمط سيلّا. */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!visible) {
    return null;
  }
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose}>
        <Pressable style={sheetStyles.card} onPress={() => undefined}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '88%',
    padding: spacing.lg,
    gap: spacing.md,
  },
});
