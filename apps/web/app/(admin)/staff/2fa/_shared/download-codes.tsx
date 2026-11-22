'use client';

/**
 * Saving the recovery codes (`screens/25-staff-totp.md` Download codes).
 *
 * A client control because a file download is a browser effect: the codes are already on the page,
 * and this makes the copy the staff member saves. The button is a real button, so it is reachable and
 * announceable; with scripting disabled the codes remain selectable text above it.
 */
import { Button } from '@odp/ui';

export function DownloadCodes({ codes, label }: { codes: readonly string[]; label: string }) {
  const download = (): void => {
    const body = [
      'Oyo Digital Parliament — staff recovery codes',
      '',
      ...codes,
      '',
      'Each code works once. A fresh set is issued only when the operator resets the credential and you enrol again.',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'odp-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" type="button" onClick={download} className="w-full tablet:w-auto">
      {label}
    </Button>
  );
}
