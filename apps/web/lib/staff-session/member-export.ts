/**
 * The member export `C-070`'s `exportMemberData` operation produces (`C-036`, `C-067`).
 *
 * The Identity and Access Service is the only component allowed to read a member's real name,
 * telephone number and declared age (`C-070`), and a completed export is the one place those values
 * leave it: they go into a private object under an opaque key, never into the operator's queue and
 * never onto a screen. The archive is the member's own `C-032` record — profile, consents, data
 * requests, submissions, held backings and withheld items — as one machine-readable JSON document.
 *
 * The reads go through the domain's own `readMyRecord`, so every page of personal data appends
 * `member_data.read` before it is served and this module never opens a query of its own. The object is
 * written once: `C-036` returns the same file for a repeated download, and the request row records
 * this key as `fileReference`.
 */
import {
  readMyRecord,
  type IdentityPorts,
  type MemberExportPort,
  type MyRecord,
  type ObjectStoragePort,
} from '@odp/domain';
import { zipStore } from './export-archive';

/** What the adapter needs from the deployable. */
export interface MemberExportOptions {
  readonly ports: IdentityPorts;
  readonly objectStore: ObjectStoragePort;
}

/** The export document: the member's own record, plus the file's own facts. */
export interface MemberExportDocument {
  readonly exportedAt: string;
  readonly record: MyRecord;
  readonly note: string;
}

/** Reads every submission the member authored, following the record's own cursors. */
async function readWholeRecord(ports: IdentityPorts, memberId: string): Promise<MyRecord | null> {
  let record: MyRecord | null = null;
  const submissions: MyRecord['submissions'][number][] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await readMyRecord(
      { kind: 'member', memberId, sessionId: 'internal_export' },
      ports,
      { submissionLimit: 50, ...(cursor === undefined ? {} : { submissionCursor: cursor }) },
    );
    if (!page.ok) return null;
    record ??= page.record;
    submissions.push(...page.record.submissions);
    if (page.nextCursor === null) break;
    cursor = page.nextCursor;
  }
  return record === null ? null : { ...record, submissions };
}

/** Builds the member export adapter. */
export function createMemberExport(options: MemberExportOptions): MemberExportPort {
  return {
    async exportMemberData(input) {
      const record = await readWholeRecord(options.ports, input.memberId);
      if (record === null) {
        throw new Error('the member named by the export request could not be read');
      }

      const document: MemberExportDocument = {
        exportedAt: input.at,
        record,
        note:
          'This file is the record the platform holds about you. Your display name and submissions are public; your full name, telephone number and age are held privately and appear here because this export is for you.',
      };

      const encoder = new TextEncoder();
      const body = zipStore([
        {
          name: 'member-data.json',
          data: encoder.encode(JSON.stringify(document, null, 2)),
        },
        {
          name: 'manifest.txt',
          data: encoder.encode(
            `Oyo Digital Parliament data export\nmember: ${input.memberId}\nrequest: ${input.requestId}\ngenerated: ${input.at}\n`,
          ),
        },
      ]);

      // The key is opaque: one request, one object, no name, number or ward description in it.
      const objectReference = `exports/${input.requestId}.zip`;
      await options.objectStore.put({
        key: objectReference,
        body,
        contentType: 'application/zip',
      });

      return { objectReference, generatedAt: input.at };
    },
  };
}
