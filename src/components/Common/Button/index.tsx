import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import type { ForwardedRef, JSX } from 'react';
import React from 'react';
import useUpstreamTheme from '@app/hooks/useUpstreamTheme';
import { twMerge } from 'tailwind-merge';
import buttonStyles from './Button.module.css';

export type ButtonType =
  | 'default'
  | 'primary'
  | 'danger'
  | 'warning'
  | 'externalService'
  | 'success'
  | 'blocklist'
  | 'manage'
  | 'reportIssue'
  | 'association'
  | 'prowlarr'
  | 'bulkRequest'
  | 'detailRequest'
  | 'trailer'
  | 'playback'
  | 'ghost';

// Helper type to override types (overrides onClick)
type MergeElementProps<
  T extends React.ElementType,
  P extends Record<string, unknown>,
> = Omit<React.ComponentProps<T>, keyof P> & P;

type ElementTypes = 'button' | 'a';

type Element<P extends ElementTypes = 'button'> = P extends 'a'
  ? HTMLAnchorElement
  : HTMLButtonElement;

type BaseProps<P> = {
  buttonType?: ButtonType;
  buttonSize?: 'standard' | 'default' | 'lg' | 'md' | 'sm';
  /** Explains a state-based disabled action in the shared styled tooltip. */
  disabledReason?: string;
  buttonIcon?: 'cancel' | 'browse' | 'delete' | 'retry';
  /** Uses shared square geometry for an action with only an icon. */
  iconOnly?: boolean;
  // Had to do declare this manually as typescript would assume e was of type any otherwise
  onClick?: (
    e: React.MouseEvent<P extends 'a' ? HTMLAnchorElement : HTMLButtonElement>
  ) => void;
};

export type ButtonProps<P extends React.ElementType> = {
  as?: P;
} & MergeElementProps<P, BaseProps<P>>;

const buttonTypeStyles: Record<ButtonType, string> = {
  default: 'app-button-default',
  primary: 'app-button-primary',
  danger: 'app-button-danger',
  warning: 'app-button-warning',
  externalService: 'app-button-external-service',
  success: 'app-button-success',
  blocklist: 'app-button-blocklist',
  manage: 'app-button-manage',
  reportIssue: 'app-button-report-issue',
  association: 'app-button-association',
  prowlarr: 'app-button-prowlarr',
  bulkRequest: 'app-button-bulk-request',
  detailRequest: 'app-button-detail-request',
  trailer: 'app-button-trailer',
  playback: 'app-button-playback',
  ghost: 'app-button-ghost',
};

const buttonSizeStyles: Record<
  NonNullable<BaseProps<unknown>['buttonSize']>,
  string
> = {
  standard: 'button-standard',
  default: 'button-standard',
  md: 'button-md',
  sm: 'button-sm',
  lg: 'button-lg',
};

const upstreamButtonTypeStyles: Record<ButtonType, string> = {
  default:
    'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 group-hover:text-white group-hover:bg-gray-700 group-hover:border-gray-600 focus:border-blue-300 focus:ring-blue active:text-gray-200 active:bg-gray-700 active:border-gray-600',
  primary:
    'text-white border border-indigo-500 bg-indigo-600/80 hover:bg-indigo-600 hover:border-indigo-500 focus:border-indigo-700 focus:ring-indigo active:bg-indigo-600 active:border-indigo-700',
  danger:
    'text-white bg-red-600/80 border-red-500 hover:bg-red-600 hover:border-red-500 focus:border-red-700 focus:ring-red active:bg-red-700 active:border-red-700',
  warning:
    'text-white border border-yellow-500 bg-yellow-500/80 hover:bg-yellow-500 hover:border-yellow-400 focus:border-yellow-700 focus:ring-yellow active:bg-yellow-500 active:border-yellow-700',
  externalService:
    'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 focus:border-blue-300 focus:ring-blue',
  success:
    'text-white bg-green-500/80 border-green-500 hover:bg-green-500 hover:border-green-400 focus:border-green-700 focus:ring-green active:bg-green-500 active:border-green-700',
  blocklist:
    'text-white bg-red-600/80 border-red-500 hover:bg-red-600 hover:border-red-500 focus:border-red-700 focus:ring-red active:bg-red-700 active:border-red-700',
  manage:
    'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 focus:border-blue-300 focus:ring-blue',
  reportIssue:
    'text-white bg-red-600/80 border-red-500 hover:bg-red-600 hover:border-red-500 focus:border-red-700 focus:ring-red active:bg-red-700 active:border-red-700',
  association:
    'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 focus:border-blue-300 focus:ring-blue',
  prowlarr:
    'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 focus:border-blue-300 focus:ring-blue',
  bulkRequest:
    'text-white border border-indigo-500 bg-indigo-600/80 hover:bg-indigo-600 hover:border-indigo-500 focus:border-indigo-700 focus:ring-indigo active:bg-indigo-600 active:border-indigo-700',
  detailRequest:
    'text-white border border-indigo-500 bg-indigo-600/80 hover:bg-indigo-600 hover:border-indigo-500 focus:border-indigo-700 focus:ring-indigo active:bg-indigo-600 active:border-indigo-700',
  trailer:
    'text-gray-200 bg-gray-800/80 border-gray-600 hover:text-white hover:bg-gray-700 hover:border-gray-600 focus:border-blue-300 focus:ring-blue',
  playback:
    'text-white bg-green-500/80 border-green-500 hover:bg-green-500 hover:border-green-400 focus:border-green-700 focus:ring-green active:bg-green-500 active:border-green-700',
  ghost:
    'text-white bg-transparent border-gray-600 hover:border-gray-200 focus:border-gray-100 active:border-gray-100',
};

const upstreamButtonSizeStyles: Record<
  NonNullable<BaseProps<unknown>['buttonSize']>,
  string
> = {
  standard: 'px-4 py-2 text-sm button-md',
  default: 'px-4 py-2 text-sm button-md',
  md: 'px-4 py-2 text-sm button-md',
  sm: 'px-2.5 py-1.5 text-xs button-sm',
  lg: 'px-6 py-3 text-base button-lg',
};

function Button<P extends ElementTypes = 'button'>(
  {
    buttonType = 'default',
    buttonSize = 'standard',
    as,
    children,
    className,
    disabledReason,
    buttonIcon,
    iconOnly = false,
    ...props
  }: ButtonProps<P>,
  ref?: React.Ref<Element<P>>
): JSX.Element {
  const upstream = useUpstreamTheme();
  const buttonStyle = upstream
    ? twMerge(
        'inline-flex items-center justify-center border leading-5 font-medium rounded-md focus:outline-none transition ease-in-out duration-150 cursor-pointer disabled:opacity-50 whitespace-nowrap',
        upstreamButtonTypeStyles[buttonType],
        upstreamButtonSizeStyles[buttonSize],
        iconOnly && 'p-2',
        className
      )
    : twMerge(
        'app-button',
        buttonTypeStyles[buttonType],
        buttonSizeStyles[buttonSize],
        iconOnly && 'app-button-icon-only',
        className,
        buttonStyles.button
      );

  if (as === 'a') {
    return (
      <a
        className={buttonStyle}
        {...(props as React.ComponentProps<'a'>)}
        data-button-icon={buttonIcon}
        data-button-help={props.title}
        title={upstream ? (props as React.ComponentProps<'a'>).title : undefined}
        ref={ref as ForwardedRef<HTMLAnchorElement>}
      >
        <span className={upstream ? 'flex items-center' : undefined}>
          {buttonIcon === 'cancel' && <XMarkIcon aria-hidden="true" />}
          {buttonIcon === 'delete' && <TrashIcon aria-hidden="true" />}
          {buttonIcon === 'retry' && <ArrowPathIcon aria-hidden="true" />}
          {buttonIcon === 'browse' && (
            <MagnifyingGlassIcon aria-hidden="true" />
          )}
          {children}
        </span>
      </a>
    );
  } else {
    const buttonProps = props as React.ComponentProps<'button'>;
    const disabledTitle = buttonProps.disabled
      ? (disabledReason ?? 'This action is unavailable in the current state.')
      : buttonProps.title;

    return (
      <button
        className={buttonStyle}
        {...buttonProps}
        data-button-icon={buttonIcon}
        data-button-help={buttonProps.title}
        data-disabled-reason={disabledTitle}
        title={upstream ? buttonProps.title : undefined}
        ref={ref as ForwardedRef<HTMLButtonElement>}
      >
        <span className={upstream ? 'flex items-center' : undefined}>
          {buttonIcon === 'cancel' && <XMarkIcon aria-hidden="true" />}
          {buttonIcon === 'delete' && <TrashIcon aria-hidden="true" />}
          {buttonIcon === 'retry' && <ArrowPathIcon aria-hidden="true" />}
          {buttonIcon === 'browse' && (
            <MagnifyingGlassIcon aria-hidden="true" />
          )}
          {children}
        </span>
      </button>
    );
  }
}

export default React.forwardRef(Button) as typeof Button;
