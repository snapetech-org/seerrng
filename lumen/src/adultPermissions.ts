const ADULT_ACCESS = 2n | 16n | 140737488355328n;

export const canRequestAdult = (permissions?: number) => {
  if (
    typeof permissions !== 'number' ||
    !Number.isSafeInteger(permissions) ||
    permissions < 0
  )
    return false;

  return (BigInt(permissions) & ADULT_ACCESS) !== 0n;
};
