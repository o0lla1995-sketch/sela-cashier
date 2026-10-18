/**
 * ui.tsx — v2.0: مجموعة مكونات «سيلّا كاشير» — نفس لغة تصميم تطبيق
 * نقطة البيع أندرويد حرفياً (نفس الأزرار الخمسة، البطاقات، الشرائح،
 * البحث بزر مسح واضح، المبدّل، العدّاد، التنبيهات العائمة).
 * ─────────────────────────────────────────────────────────────────
 * أهم إضافة بطلب التاجر: SearchBar يحمل زر مسح دائماً ظاهراً عند
 * وجود نص (زر مسح الباركود الذي كان مفقوداً).
 */
import React, {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  I18nManager,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {create} from 'zustand';
import {Icon, type IconName} from './Icon';
import {
  fonts,
  makeStyles,
  spacing,
  typography,
  useThemeColors,
} from './theme';

// ── Screen ───────────────────────────────────────────────────────
export function Screen({children}: {children: React.ReactNode}) {
  const c = useThemeColors();
  return (
    <View style={{flex: 1, backgroundColor: c.bg}}>{children}</View>
  );
}

// ── AppHeader ────────────────────────────────────────────────────
export function AppHeader({
  title,
  subtitle,
  showBack,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const c = useThemeColors();
  const styles = useHeaderStyles();
  return (
    <View style={styles.wrap}>
      {showBack ? (
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
          <Icon
            name={I18nManager.isRTL ? 'chevronRight' : 'chevronLeft'}
            size={22}
            color={c.text}
          />
        </Pressable>
      ) : null}
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const useHeaderStyles = makeStyles(c =>
  StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      backgroundColor: c.surface,
      borderBottomWidth: 1,
      borderBottomColor: c.borderSoft,
    },
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
    },
    subtitle: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: I18nManager.isRTL ? 'right' : 'left',
      marginTop: 1,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);

// ── AppButton — نفس الخمسة أنماط بنقطة البيع ─────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger';

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  icon,
  small = false,
  disabled = false,
  loading = false,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: object | Array<object>;
}) {
  const c = useThemeColors();
  const styles = useButtonStyles();
  const paletteMap: Record<ButtonVariant, {bg: string; fg: string}> = {
    primary: {bg: c.accent, fg: c.onAccent},
    secondary: {bg: c.surfaceHi, fg: c.text},
    ghost: {bg: 'transparent', fg: c.textDim},
    success: {bg: c.success, fg: '#FFFFFF'},
    danger: {bg: c.danger, fg: '#FFFFFF'},
  };
  const p = paletteMap[variant];
  const opacity = disabled ? 0.45 : 1;
  return (
    <Pressable
      style={({pressed}) => [
        styles.base,
        small ? styles.small : styles.big,
        {backgroundColor: p.bg, opacity, transform: [{scale: pressed ? 0.97 : 1}]},
        style,
      ]}
      disabled={disabled || loading}
      onPress={onPress}>
      {loading ? (
        <ActivityIndicator color={p.fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 15 : 18} color={p.fg} /> : null}
          <Text
            style={[
              small ? styles.labelSmall : styles.label,
              {color: p.fg},
            ]}
            numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const useButtonStyles = makeStyles(c =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 13,
    },
    big: {paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 50},
    small: {paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 1, minHeight: 38},
    label: {
      fontFamily: fonts.bold,
      fontSize: typography.body,
    },
    labelSmall: {
      fontFamily: fonts.bold,
      fontSize: typography.small + 1,
    },
  }),
);

// ── Card / SectionTitle ──────────────────────────────────────────
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: object | Array<object>;
  onPress?: () => void;
}) {
  const styles = useCardStyles();
  if (onPress != null) {
    return (
      <Pressable style={[styles.card, style]} onPress={onPress}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

const useCardStyles = makeStyles(c =>
  StyleSheet.create({
    card: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: spacing.md,
    },
  }),
);

export function SectionTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  const styles = useSectionStyles();
  return (
    <View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useSectionStyles = makeStyles(c =>
  StyleSheet.create({
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.body,
      textAlign: 'right',
    },
    hint: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 2,
      textAlign: 'right',
      marginTop: 1,
    },
  }),
);

// ── Badge ────────────────────────────────────────────────────────
type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info';

export function Badge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone;
}) {
  const c = useThemeColors();
  const styles = useBadgeStyles();
  const map: Record<BadgeTone, {bg: string; fg: string}> = {
    neutral: {bg: c.surfaceHi, fg: c.textDim},
    accent: {bg: c.accentSoft, fg: c.accent},
    success: {bg: c.successSoft, fg: c.success},
    danger: {bg: c.dangerSoft, fg: c.danger},
    warning: {bg: c.warningSoft, fg: c.warning},
    info: {bg: c.infoSoft, fg: c.info},
  };
  const p = map[tone];
  return (
    <View style={[styles.base, {backgroundColor: p.bg}]}>
      <Text style={[styles.label, {color: p.fg}]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useBadgeStyles = makeStyles(c =>
  StyleSheet.create({
    base: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 3.5,
      alignSelf: 'flex-start',
    },
    label: {
      fontFamily: fonts.bold,
      fontSize: typography.micro + 1.5,
    },
  }),
);

// ── EmptyState ───────────────────────────────────────────────────
export function EmptyState({
  icon = 'inbox',
  title,
  subtitle,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
}) {
  const c = useThemeColors();
  const styles = useEmptyStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.iconChip}>
        <Icon name={icon} size={26} color={c.textFaint} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const useEmptyStyles = makeStyles(c =>
  StyleSheet.create({
    wrap: {alignItems: 'center', padding: spacing.xl, gap: 8},
    iconChip: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    title: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      textAlign: 'center',
    },
    subtitle: {
      color: c.textDim,
      fontFamily: fonts.regular,
      fontSize: typography.small,
      textAlign: 'center',
      lineHeight: 19,
    },
  }),
);

// ── StatCard — بطاقة مؤشر (نفس نقطة البيع) ───────────────────────
export function StatCard({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'info';
  icon?: IconName;
}) {
  const c = useThemeColors();
  const styles = useStatStyles();
  const colorMap = {
    neutral: c.text,
    accent: c.accent,
    success: c.success,
    danger: c.danger,
    info: c.info,
  } as const;
  return (
    <View style={styles.card}>
      {icon ? (
        <View style={styles.iconRow}>
          <Icon name={icon} size={16} color={colorMap[tone]} />
        </View>
      ) : null}
      <Text style={[styles.value, {color: colorMap[tone]}]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const useStatStyles = makeStyles(c =>
  StyleSheet.create({
    card: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderSoft,
      padding: spacing.md,
      gap: 3,
      minWidth: 100,
    },
    iconRow: {marginBottom: 2},
    value: {
      fontFamily: fonts.black,
      fontSize: typography.heading + 2,
      textAlign: 'right',
    },
    label: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: typography.micro + 2,
      textAlign: 'right',
    },
  }),
);

// ── SearchBar — مع زر المسح الواضح (طلب التاجر حرفياً) ───────────
export function SearchBar({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const c = useThemeColors();
  const styles = useSearchStyles();
  return (
    <View style={styles.box}>
      <Icon name="search" size={17} color={c.textFaint} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textFaint}
        autoFocus={autoFocus}
        onSubmitEditing={onSubmit}
        returnKeyType={onSubmit ? 'search' : 'done'}
        textAlign={I18nManager.isRTL ? 'right' : 'left'}
      />
      {value.length > 0 ? (
        <Pressable
          style={styles.clearBtn}
          onPress={() => {
            onChangeText('');
            if (onSubmit) {
              onSubmit();
            }
          }}
          hitSlop={6}>
          <Icon name="x" size={14} color={c.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const useSearchStyles = makeStyles(c =>
  StyleSheet.create({
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 13,
      paddingHorizontal: spacing.md,
      minHeight: 46,
    },
    input: {
      flex: 1,
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.body,
      paddingVertical: 8,
    },
    clearBtn: {
      width: 28,
      height: 28,
      borderRadius: 999,
      backgroundColor: c.surfaceHi,
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);

// ── Segmented ────────────────────────────────────────────────────
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: {value: T; label: string}[];
}) {
  const c = useThemeColors();
  const styles = useSegmentedStyles();
  return (
    <View style={styles.track}>
      {options.map(option => {
        const active = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            style={[styles.item, active ? {backgroundColor: c.accent} : null]}
            onPress={() => onChange(option.value)}>
            <Text
              style={[
                styles.label,
                active ? {color: c.onAccent, fontFamily: fonts.bold} : null,
              ]}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useSegmentedStyles = makeStyles(c =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      backgroundColor: c.surfaceHi,
      borderRadius: 12,
      padding: 3,
      gap: 2,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 9,
      paddingHorizontal: 4,
    },
    label: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: typography.small,
    },
  }),
);

// ── Stepper (عدّاد الكمية) ───────────────────────────────────────
export function Stepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const c = useThemeColors();
  const styles = useStepperStyles();
  const clamp = (v: number) => {
    let out = v;
    if (min != null) {
      out = Math.max(min, out);
    }
    if (max != null) {
      out = Math.min(max, out);
    }
    return out;
  };
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.btn}
        onPress={() => onChange(clamp(value + step))}
        hitSlop={4}>
        <Icon name="plus" size={16} color={c.text} />
      </Pressable>
      <Text style={styles.value}>{value}</Text>
      <Pressable
        style={styles.btn}
        onPress={() => onChange(clamp(value - step))}
        hitSlop={4}>
        <Icon name="minus" size={16} color={c.text} />
      </Pressable>
    </View>
  );
}

const useStepperStyles = makeStyles(c =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    btn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    value: {
      color: c.text,
      fontFamily: fonts.bold,
      fontSize: typography.body,
      minWidth: 40,
      textAlign: 'center',
    },
  }),
);

// ── SwitchRow ────────────────────────────────────────────────────
export function SwitchRow({
  label,
  hint,
  value,
  onValueChange,
  icon,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: IconName;
}) {
  const c = useThemeColors();
  const styles = useSwitchStyles();
  return (
    <Pressable style={styles.row} onPress={() => onValueChange(!value)}>
      {icon ? (
        <View style={styles.iconChip}>
          <Icon name={icon} size={17} color={c.accent} />
        </View>
      ) : null}
      <View style={{flex: 1}}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.track, value ? {backgroundColor: c.accent} : null]}>
        <View
          style={[styles.thumb, value ? styles.thumbOn : null]}
        />
      </View>
    </Pressable>
  );
}

const useSwitchStyles = makeStyles(c =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    iconChip: {
      width: 38,
      height: 38,
      borderRadius: 11,
      backgroundColor: c.accentSofter,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: c.text,
      fontFamily: fonts.medium,
      fontSize: typography.body,
      textAlign: 'right',
    },
    hint: {
      color: c.textFaint,
      fontFamily: fonts.regular,
      fontSize: typography.micro + 2,
      textAlign: 'right',
      marginTop: 1,
    },
    track: {
      width: 46,
      height: 27,
      borderRadius: 999,
      backgroundColor: c.surfaceHi,
      borderWidth: 1,
      borderColor: c.border,
      padding: 2.5,
      justifyContent: 'center',
    },
    thumb: {
      width: 20,
      height: 20,
      borderRadius: 999,
      backgroundColor: c.textFaint,
      alignSelf: 'flex-start',
    },
    thumbOn: {backgroundColor: '#FFFFFF', alignSelf: 'flex-end'},
  }),
);

// ── Field (حقل إدخال ببطاقة) ─────────────────────────────────────
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  numeric = false,
  secure = false,
  suffix,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  numeric?: boolean;
  secure?: boolean;
  suffix?: string;
}) {
  const c = useThemeColors();
  const styles = useFieldStyles();
  return (
    <View style={{gap: 4}}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.box}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={c.textFaint}
          keyboardType={numeric ? 'decimal-pad' : 'default'}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoCorrect={false}
          textAlign={I18nManager.isRTL ? 'right' : 'left'}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

const useFieldStyles = makeStyles(c =>
  StyleSheet.create({
    label: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: typography.small,
      textAlign: 'right',
    },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceHi,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.borderSoft,
      paddingHorizontal: spacing.md,
    },
    input: {
      flex: 1,
      color: c.text,
      fontFamily: fonts.regular,
      fontSize: typography.body,
      paddingVertical: 10,
    },
    suffix: {
      color: c.textDim,
      fontFamily: fonts.medium,
      fontSize: typography.small,
    },
  }),
);

// ── Sheet (نافذة سفلية) ──────────────────────────────────────────
export function Sheet({
  visible,
  onClose,
  children,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const c = useThemeColors();
  const styles = useSheetStyles();
  const animated = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(animated, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }).start();
    } else {
      animated.setValue(0);
    }
  }, [visible, animated]);

  if (!visible) {
    return null;
  }
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.panel} onPress={() => undefined}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useSheetStyles = makeStyles(c =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: c.overlay,
      justifyContent: 'flex-end',
    },
    panel: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      gap: spacing.md,
      maxHeight: '88%',
    },
    grabber: {
      alignSelf: 'center',
      width: 44,
      height: 4.5,
      borderRadius: 999,
      backgroundColor: c.border,
      marginBottom: spacing.xs,
    },
    title: {
      color: c.text,
      fontFamily: fonts.black,
      fontSize: typography.heading,
      textAlign: 'right',
    },
  }),
);

// ── Toaster (تنبيهات عائمة) ──────────────────────────────────────
export interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
}

interface ToastState {
  items: ToastItem[];
  show: (message: string, kind?: ToastItem['kind']) => void;
  dismiss: (id: number) => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  items: [],
  show: (message, kind = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set({items: [...get().items.slice(-2), {id, message, kind}]});
    setTimeout(() => get().dismiss(id), kind === 'error' ? 4200 : 2600);
  },
  dismiss: id => set({items: get().items.filter(t => t.id !== id)}),
}));

export function Toaster() {
  const c = useThemeColors();
  const items = useToastStore(state => state.items);
  const styles = useToastStyles();
  return (
    <View style={styles.wrap} pointerEvents="none">
      {items.map(item => (
        <View
          key={item.id}
          style={[
            styles.toast,
            {
              backgroundColor:
                item.kind === 'success'
                  ? c.success
                  : item.kind === 'error'
                  ? c.danger
                  : c.surfaceHi,
            },
          ]}>
          <Text
            style={[
              styles.text,
              {color: item.kind === 'info' ? c.text : '#FFFFFF'},
            ]}>
            {item.message}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useToastStyles = makeStyles(c =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      bottom: 92,
      left: spacing.lg,
      right: spacing.lg,
      gap: 8,
      alignItems: 'center',
    },
    toast: {
      borderRadius: 13,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 2,
      maxWidth: '100%',
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: {width: 0, height: 3},
    },
    text: {
      fontFamily: fonts.bold,
      fontSize: typography.small + 1.5,
      textAlign: 'center',
    },
  }),
);
