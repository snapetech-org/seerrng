import {
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  size,
  useClick,
  useClientPoint,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
  type Placement,
} from '@floating-ui/react';
import React, { useEffect, useId, useMemo, useState } from 'react';

export interface TooltipConfig {
  placement?: Placement;
  offset?: {
    mainAxis?: number;
    crossAxis?: number;
  };
  followCursor?: boolean;
  followCursorAxis?: 'x' | 'y' | 'both';
  interactive?: boolean;
  delayHide?: number;
  trigger?: ('hover' | 'click' | 'focus')[];
}

type TooltipProps = {
  content: React.ReactNode;
  children: React.ReactElement<Record<string, unknown>>;
  tooltipConfig?: TooltipConfig;
  className?: string;
};

const getComponentName = (element: React.ReactElement) => {
  const type = element.type as {
    displayName?: string;
    name?: string;
    render?: { displayName?: string; name?: string };
  };

  return (
    type.displayName ??
    type.render?.displayName ??
    type.name ??
    type.render?.name ??
    ''
  );
};

const isControlLike = (element: React.ReactElement) => {
  const props = element.props as Record<string, unknown>;
  const tag = typeof element.type === 'string' ? element.type : '';
  const role = typeof props.role === 'string' ? props.role : '';

  return (
    ['button', 'input', 'select', 'textarea', 'a', 'area', 'summary'].includes(
      tag
    ) ||
    [
      'button',
      'checkbox',
      'combobox',
      'link',
      'listbox',
      'menuitem',
      'option',
      'radio',
      'slider',
      'spinbutton',
      'switch',
      'textbox',
    ].includes(role) ||
    typeof props.onClick === 'function' ||
    typeof props.onChange === 'function' ||
    (typeof props.type === 'string' &&
      ['button', 'checkbox', 'radio', 'range', 'submit'].includes(
        props.type
      )) ||
    /Button|Checkbox|Control|Dropdown|Field|Listbox|Selector|Switch|Toggle/.test(
      getComponentName(element)
    )
  );
};

const isDisabledControl = (element: React.ReactElement) => {
  const props = element.props as Record<string, unknown>;

  return (
    (props.disabled === true || props['aria-disabled'] === true) &&
    isControlLike(element)
  );
};

const isFocusableReference = (element: React.ReactElement) => {
  const props = element.props as Record<string, unknown>;
  const tag = typeof element.type === 'string' ? element.type : '';
  const tabIndex = props.tabIndex;

  if (props.disabled === true || props['aria-disabled'] === true) return false;
  if (typeof tabIndex === 'number') return tabIndex >= 0;
  if (tag === 'a' || tag === 'area') return Boolean(props.href);
  if (tag === 'input' && props.type === 'hidden') return false;
  if (
    ['button', 'input', 'select', 'textarea', 'summary'].includes(tag) ||
    (['audio', 'video'].includes(tag) && props.controls === true)
  )
    return true;
  if (props.contentEditable === true) return true;
  if (props.href) return true;
  if (
    /Button|Checkbox|Dropdown|Field|Listbox|Selector|Switch|Toggle/.test(
      getComponentName(element)
    )
  )
    return true;

  return false;
};

const getMeaningfulChildren = (
  children: React.ReactNode
): React.ReactNode[] => {
  if (Array.isArray(children)) return children.flatMap(getMeaningfulChildren);
  if (
    children === null ||
    children === undefined ||
    typeof children === 'boolean' ||
    (typeof children === 'string' && !children.trim())
  )
    return [];

  return [children];
};

const findFocusableDescendant = (
  element: React.ReactElement
): React.ReactElement | undefined => {
  if (isDisabledControl(element)) return undefined;
  if (isFocusableReference(element)) return element;

  const children = getMeaningfulChildren(
    (element.props as { children?: React.ReactNode }).children
  );
  const matches = children
    .filter(React.isValidElement)
    .map((child) => findFocusableDescendant(child))
    .filter((child): child is React.ReactElement => Boolean(child));

  return matches.length === 1 ? matches[0] : undefined;
};

const containsDisabledControl = (element: React.ReactElement): boolean => {
  if (isDisabledControl(element)) return true;

  return getMeaningfulChildren(
    (element.props as { children?: React.ReactNode }).children
  )
    .filter(React.isValidElement)
    .some((child) => containsDisabledControl(child));
};

const getAccessibleText = (node: React.ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number')
    return String(node).trim();
  if (Array.isArray(node))
    return node.map(getAccessibleText).filter(Boolean).join(' ');
  if (!React.isValidElement(node)) return '';

  const props = node.props as Record<string, unknown>;
  if (props['aria-hidden'] === true) return '';
  if (typeof props['aria-label'] === 'string') return props['aria-label'];

  return getAccessibleText(props.children as React.ReactNode);
};

const cloneReferenceTarget = (
  node: React.ReactNode,
  target: React.ReactElement,
  props: Record<string, unknown>
): React.ReactNode => {
  if (Array.isArray(node))
    return node.map((child) => cloneReferenceTarget(child, target, props));
  if (!React.isValidElement(node)) return node;
  if (node === target) return React.cloneElement(node, props);

  const children = cloneReferenceTarget(
    (node.props as { children?: React.ReactNode }).children,
    target,
    props
  );

  return React.cloneElement(node, {}, children);
};

const Tooltip = ({
  children,
  content,
  tooltipConfig,
  className,
}: TooltipProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const referenceId = useId();
  const hasContent =
    content !== null &&
    content !== undefined &&
    content !== false &&
    content !== '';
  const interactive = tooltipConfig?.interactive ?? false;
  const triggers = tooltipConfig?.trigger ?? ['hover', 'focus'];
  const placement = tooltipConfig?.placement ?? 'top';
  const mainAxis = tooltipConfig?.offset?.mainAxis ?? 14;
  const crossAxis = tooltipConfig?.offset?.crossAxis ?? 0;

  const middleware = useMemo(
    () => [
      offset({ mainAxis, crossAxis }),
      flip({ padding: 8 }),
      shift({ crossAxis: true, padding: 8 }),
      size({
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.setProperty(
            '--app-tooltip-available-height',
            `${Math.max(0, availableHeight)}px`
          );
        },
      }),
    ],
    [mainAxis, crossAxis]
  );
  const { refs, floatingStyles, context } = useFloating({
    whileElementsMounted: autoUpdate,
    open: isOpen && hasContent,
    onOpenChange: setIsOpen,
    placement,
    middleware,
  });

  useEffect(() => {
    if (!hasContent) setIsOpen(false);
  }, [hasContent]);

  const hover = useHover(context, {
    enabled: hasContent && triggers.includes('hover'),
    mouseOnly: true,
    move: false,
    delay: {
      close: tooltipConfig?.delayHide ?? (interactive ? 100 : 0),
    },
    handleClose: safePolygon(),
  });
  const click = useClick(context, {
    enabled: hasContent && triggers.includes('click'),
  });
  const focus = useFocus(context, {
    enabled: hasContent && triggers.includes('focus'),
    visibleOnly: false,
  });
  const dismiss = useDismiss(context, { enabled: hasContent });
  const role = useRole(context, {
    role: interactive ? 'dialog' : 'tooltip',
    enabled: hasContent,
  });
  const clientPoint = useClientPoint(context, {
    enabled: hasContent && (tooltipConfig?.followCursor ?? false),
    axis: tooltipConfig?.followCursorAxis ?? 'both',
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    click,
    focus,
    dismiss,
    role,
    clientPoint,
  ]);

  const focusableDescendant = findFocusableDescendant(children);
  const referenceTarget = focusableDescendant ?? children;
  const needsKeyboardReference =
    triggers.includes('focus') || triggers.includes('click');
  const needsDisabledWrapper =
    needsKeyboardReference &&
    !focusableDescendant &&
    isDisabledControl(children);
  const targetProps = referenceTarget.props as Record<string, unknown>;
  const childId =
    typeof targetProps.id === 'string' ? targetProps.id : undefined;
  const referenceRef = useMergeRefs([
    targetProps.ref as React.Ref<Element> | undefined,
    needsDisabledWrapper ? undefined : refs.setReference,
  ]);
  const rootNeedsTabIndex =
    needsKeyboardReference &&
    referenceTarget === children &&
    !isFocusableReference(referenceTarget) &&
    !needsDisabledWrapper &&
    typeof targetProps.tabIndex !== 'number';
  const referenceBaseProps = needsDisabledWrapper
    ? {
        id: referenceId,
        role: 'group',
        tabIndex: 0,
        'aria-label': getAccessibleText(children) || undefined,
      }
    : {
        ...targetProps,
        id: childId ?? referenceId,
        ref: referenceRef,
        ...(rootNeedsTabIndex ? { tabIndex: 0 } : {}),
        ...(rootNeedsTabIndex && containsDisabledControl(children)
          ? {
              role:
                typeof targetProps.role === 'string'
                  ? targetProps.role
                  : 'group',
              'aria-label':
                typeof targetProps['aria-label'] === 'string'
                  ? targetProps['aria-label']
                  : getAccessibleText(children) || undefined,
            }
          : {}),
      };
  const mergedReferenceProps = getReferenceProps(referenceBaseProps);
  const existingDescribedBy =
    typeof targetProps['aria-describedby'] === 'string'
      ? targetProps['aria-describedby']
      : undefined;
  const tooltipDescription = mergedReferenceProps['aria-describedby'];
  const describedBy = [existingDescribedBy, tooltipDescription]
    .filter(
      (value): value is string => typeof value === 'string' && Boolean(value)
    )
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ');
  const referenceProps = {
    ...mergedReferenceProps,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    'data-app-tooltip-owned': true,
  };
  const tooltipClassName = useMemo(
    () => ['app-tooltip', className].filter(Boolean).join(' '),
    [className]
  );

  if (!hasContent) return children;

  const floatingElement = (
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className={tooltipClassName}
      data-interactive={interactive ? 'true' : undefined}
      aria-labelledby={interactive ? (childId ?? referenceId) : undefined}
      {...getFloatingProps()}
    >
      {content}
    </div>
  );

  return (
    <>
      {needsDisabledWrapper ? (
        <span ref={refs.setReference} {...referenceProps}>
          {children}
        </span>
      ) : (
        cloneReferenceTarget(children, referenceTarget, referenceProps)
      )}
      {isOpen && hasContent && (
        <FloatingPortal>
          {interactive ? (
            <FloatingFocusManager
              context={context}
              modal={false}
              initialFocus={-1}
              order={['reference', 'content']}
            >
              {floatingElement}
            </FloatingFocusManager>
          ) : (
            floatingElement
          )}
        </FloatingPortal>
      )}
    </>
  );
};

export default Tooltip;
