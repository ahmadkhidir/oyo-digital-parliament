/**
 * @odp/ui barrel — the package's only public surface. Consumers import from here; a deep
 * import across the package boundary is a defect (`packages/ui/AGENTS.md`, Manifest and
 * barrel). Each export carries its prop and state types.
 */

// Primitives.
export {
  Button,
  buttonClasses,
  type ButtonProps,
  type ButtonVariant,
} from './primitives/button/Button';
export { TextInput, type TextInputProps } from './primitives/text-input/TextInput';
export { FieldLabel, type FieldLabelProps } from './primitives/field-label/FieldLabel';
export { FieldError, type FieldErrorProps } from './primitives/field-error/FieldError';
export { focusRingClasses } from './primitives/focus-ring';

// Record components (`screens.md`, Shared / Common Components).
export {
  RecordHeader,
  type RecordHeaderProps,
  type HeaderDestination,
} from './records/record-header/RecordHeader';
export {
  RecordFooter,
  type RecordFooterProps,
  type FooterLink,
  type LanguageSwitchProps,
} from './records/record-footer/RecordFooter';
export { CommitmentRow, type CommitmentRowProps } from './records/commitment-row/CommitmentRow';
export {
  DecisionReasonBlock,
  type DecisionReasonBlockProps,
} from './records/decision-reason-block/DecisionReasonBlock';
export { SignInPrompt, type SignInPromptProps } from './records/sign-in-prompt/SignInPrompt';
export { StatusLabel, type StatusLabelProps } from './records/status-label/StatusLabel';

// The register's status vocabulary, re-exported so callers type their props without a deep import.
export type { StatusKey } from './tokens/source';
