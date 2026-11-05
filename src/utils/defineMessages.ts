import { defineMessages as intlDefineMessages } from 'react-intl';

type Messages<T extends Record<string, string>> = {
  [K in keyof T]: {
    id: string;
    defaultMessage: T[K];
  };
};

export default function defineMessages<T extends Record<string, string>>(
  prefix: string,
  messages: T
): Messages<T> {
  const keys: (keyof T)[] = Object.keys(messages);
  const modifiedMessagesEntries = keys.map((key) => [
    key,
    {
      id: `${prefix}.${key as string}`,
      defaultMessage: messages[key],
    },
  ]);
  const modifiedMessages: Messages<T> = Object.fromEntries(
    modifiedMessagesEntries
  );
  // FormatJS returns the same descriptor map. Preserve our exact generic
  // defaults rather than widening them to its optional typed-message metadata.
  intlDefineMessages(modifiedMessages);
  return modifiedMessages;
}
